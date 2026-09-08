"use strict";


/* ============================================================
   DOM
============================================================ */

const homeScreen =
    document.getElementById("homeScreen");

const callScreen =
    document.getElementById("callScreen");

const nameInput =
    document.getElementById("nameInput");

const backButton =
    document.getElementById("backButton");

const roomLabel =
    document.getElementById("roomLabel");

const meet =
    document.getElementById("meet");

const onlineUsers =
    document.getElementById("onlineUsers");

const onlineCount =
    document.getElementById("onlineCount");

const refreshUsersButton =
    document.getElementById("refreshUsersButton");

const noUsersMessage =
    document.getElementById("noUsersMessage");

const connectionStatus =
    document.getElementById("connectionStatus");


/* ============================================================
   INCOMING CALL
============================================================ */

const incomingCallOverlay =
    document.getElementById("incomingCallOverlay");

const incomingCallerName =
    document.getElementById("incomingCallerName");

const declineCallButton =
    document.getElementById("declineCallButton");

const acceptCallButton =
    document.getElementById("acceptCallButton");


/* ============================================================
   OUTGOING CALL
============================================================ */

const callingOverlay =
    document.getElementById("callingOverlay");

const callingReceiverName =
    document.getElementById("callingReceiverName");

const cancelCallButton =
    document.getElementById("cancelCallButton");


/* ============================================================
   API
============================================================ */

const API = "/api";


/* ============================================================
   JAAS
============================================================ */

const JAAS_DOMAIN = "8x8.vc";

let jitsiApi = null;


/* ============================================================
   STATE
============================================================ */

let currentName = "";
let currentRoom = "";
let currentCallId = "";
let currentCallRole = "";
let currentReceiverId = "";
let currentReceiverName = "";

let incomingCall = null;
let incomingCallVisible = false;

let callStatusTimer = null;
let incomingCallTimer = null;

let presenceTimer = null;
let onlineUsersTimer = null;

let presenceBusy = false;
let usersPollBusy = false;

let leavingJitsi = false;
let nameUpdateTimer = null;


/* ============================================================
   USER ID
============================================================ */

function getUserId() {

    let userId = "";

    try {

        userId =
            localStorage.getItem(
                "video_call_user_id"
            ) || "";

    } catch (_) {}


    userId =
        String(userId).trim();


    if (!userId) {

        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {

            userId =
                crypto.randomUUID();

        } else {

            userId =
                "user-" +
                Date.now().toString(36) +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2, 12);
        }


        try {

            localStorage.setItem(
                "video_call_user_id",
                userId
            );

        } catch (_) {}
    }


    return userId;
}


const myUserId =
    getUserId();


/* ============================================================
   NAME
============================================================ */

function saveMyName(name) {

    const value =
        String(name || "").trim();


    try {

        if (value) {

            localStorage.setItem(
                "video_call_name",
                value
            );

        } else {

            localStorage.removeItem(
                "video_call_name"
            );
        }

    } catch (_) {}
}


function loadMyName() {

    let saved = "";

    try {

        saved =
            localStorage.getItem(
                "video_call_name"
            ) || "";

    } catch (_) {}


    saved =
        String(saved).trim();


    if (
        saved &&
        nameInput
    ) {

        nameInput.value =
            saved;
    }


    return saved;
}


function getMyName() {

    return String(
        nameInput
            ? nameInput.value
            : ""
    ).trim();
}


function getInitial(name) {

    const value =
        String(name || "").trim();


    if (!value) {
        return "?";
    }


    return value
        .charAt(0)
        .toUpperCase();
}


/* ============================================================
   STATUS
============================================================ */

function setConnectionStatus(text) {

    if (connectionStatus) {

        connectionStatus.textContent =
            text;
    }
}


/* ============================================================
   API REQUEST
============================================================ */

async function apiRequest(
    path,
    body = {},
    options = {}
) {

    const fetchOptions = {

        method: "POST",

        headers: {

            "Content-Type":
                "application/json",

            "Accept":
                "application/json"
        },

        body:
            JSON.stringify(body)
    };


    if (options.keepalive) {

        fetchOptions.keepalive =
            true;
    }


    let response;


    try {

        response =
            await fetch(
                API + path,
                fetchOptions
            );

    } catch (error) {

        console.error(
            "FETCH ERROR:",
            path,
            error
        );

        throw new Error(
            "Network connection failed."
        );
    }


    let data = {};


    try {

        data =
            await response.json();

    } catch (_) {}


    if (!response.ok) {

        throw new Error(
            data.error ||
            data.message ||
            (
                "Request failed (" +
                response.status +
                ")."
            )
        );
    }


    return data;
}


/* ============================================================
   AUTO ROOM
   User never sees this.
============================================================ */

function generatePrivateRoom() {

    const chars =
        "abcdefghijklmnopqrstuvwxyz" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "0123456789";

    let result = "";


    for (
        let i = 0;
        i < 20;
        i++
    ) {

        result +=
            chars.charAt(
                Math.floor(
                    Math.random() *
                    chars.length
                )
            );
    }


    return "call-" + result;
}


/* ============================================================
   CLEAR USER LIST
============================================================ */

function clearOnlineUsers() {

    if (!onlineUsers) {
        return;
    }


    onlineUsers.innerHTML = "";


    if (onlineCount) {

        onlineCount.textContent =
            "0";
    }


    if (noUsersMessage) {

        noUsersMessage.style.display =
            "flex";

        onlineUsers.appendChild(
            noUsersMessage
        );
    }
}


/* ============================================================
   ONLINE PRESENCE
============================================================ */

async function registerPresence() {

    const name =
        getMyName();


    if (!name) {

        setConnectionStatus(
            "Offline"
        );

        clearOnlineUsers();

        return false;
    }


    saveMyName(name);


    if (presenceBusy) {

        return true;
    }


    presenceBusy = true;


    try {

        const data =
            await apiRequest(
                "/presence/online",
                {
                    userId:
                        myUserId,

                    name:
                        name
                }
            );


        console.log(
            "Presence online:",
            data
        );


        if (
            data &&
            (
                data.ok === true ||
                data.success === true ||
                data.status === "online" ||
                data.user
            )
        ) {

            setConnectionStatus(
                "Online"
            );

            return true;
        }


        /*
         * Some Workers may return 200 with
         * a different JSON shape.
         * A successful HTTP request is still
         * considered registered.
         */

        setConnectionStatus(
            "Online"
        );


        return true;

    } catch (error) {

        console.error(
            "Presence online error:",
            error
        );

        setConnectionStatus(
            "Reconnecting..."
        );

        return false;

    } finally {

        presenceBusy = false;
    }
}


/* ============================================================
   POLL ONLINE USERS
============================================================ */

async function pollOnlineUsers() {

    const name =
        getMyName();


    if (!name) {

        clearOnlineUsers();

        return false;
    }


    if (usersPollBusy) {

        return false;
    }


    usersPollBusy = true;


    try {

        const data =
            await apiRequest(
                "/presence/poll",
                {
                    userId:
                        myUserId
                }
            );


        console.log(
            "Presence poll:",
            data
        );


        let users = [];


        /*
         * Support:
         *
         * { users: [] }
         *
         * and
         *
         * { onlineUsers: [] }
         *
         * and
         *
         * direct array response
         */

        if (Array.isArray(data)) {

            users =
                data;

        } else if (
            data &&
            Array.isArray(data.users)
        ) {

            users =
                data.users;

        } else if (
            data &&
            Array.isArray(data.onlineUsers)
        ) {

            users =
                data.onlineUsers;
        }


        users =
            users.filter(
                user => {

                    if (!user) {
                        return false;
                    }


                    const id =
                        String(
                            user.userId ||
                            user.id ||
                            ""
                        ).trim();


                    if (!id) {
                        return false;
                    }


                    return id !== myUserId;
                }
            );


        /*
         * Normalize user data.
         */

        users =
            users.map(
                user => {

                    return {

                        userId:
                            String(
                                user.userId ||
                                user.id ||
                                ""
                            ).trim(),

                        name:
                            String(
                                user.name ||
                                user.username ||
                                "User"
                            ).trim(),

                        status:
                            String(
                                user.status ||
                                "online"
                            ).toLowerCase()
                    };
                }
            );


        renderOnlineUsers(
            users
        );


        return true;

    } catch (error) {

        console.error(
            "Online users error:",
            error
        );

        /*
         * Don't erase the existing list
         * when one poll temporarily fails.
         */

        return false;

    } finally {

        usersPollBusy = false;
    }
}


/* ============================================================
   RENDER ONLINE USERS
============================================================ */

function renderOnlineUsers(users) {

    if (!onlineUsers) {

        console.error(
            "ERROR: #onlineUsers not found in HTML."
        );

        return;
    }


    const list =
        Array.isArray(users)
            ? users.filter(
                user => {

                    if (!user) {
                        return false;
                    }


                    const id =
                        String(
                            user.userId ||
                            ""
                        ).trim();


                    return (
                        id &&
                        id !== myUserId
                    );
                }
            )
            : [];


    /*
     * Clear only after we have received
     * a valid poll result.
     */

    onlineUsers.innerHTML = "";


    if (onlineCount) {

        onlineCount.textContent =
            String(
                list.length
            );
    }


    if (list.length === 0) {

        if (noUsersMessage) {

            noUsersMessage.style.display =
                "flex";

            onlineUsers.appendChild(
                noUsersMessage
            );

        } else {

            const empty =
                document.createElement(
                    "div"
                );

            empty.className =
                "no-users-message";

            empty.textContent =
                "No other users online.";

            onlineUsers.appendChild(
                empty
            );
        }


        return;
    }


    if (noUsersMessage) {

        noUsersMessage.style.display =
            "none";
    }


    list.forEach(
        user => {

            const userId =
                String(
                    user.userId
                ).trim();


            const userName =
                String(
                    user.name ||
                    "User"
                ).trim();


            const isBusy =
                String(
                    user.status ||
                    "online"
                ).toLowerCase() ===
                "busy";


            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "online-user-item";


            const info =
                document.createElement(
                    "div"
                );


            info.className =
                "online-user-info";


            const avatar =
                document.createElement(
                    "div"
                );


            avatar.className =
                "online-user-avatar";


            avatar.textContent =
                getInitial(
                    userName
                );


            const details =
                document.createElement(
                    "div"
                );


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "online-user-name";


            name.textContent =
                userName;


            const status =
                document.createElement(
                    "div"
                );


            status.className =
                "online-user-status";


            const dot =
                document.createElement(
                    "span"
                );


            dot.className =
                "online-status-dot";


            const statusText =
                document.createElement(
                    "span"
                );


            if (isBusy) {

                status.classList.add(
                    "busy"
                );

                dot.classList.add(
                    "busy"
                );

                statusText.textContent =
                    "Busy";

            } else {

                statusText.textContent =
                    "Online";
            }


            status.appendChild(
                dot
            );

            status.appendChild(
                statusText
            );


            details.appendChild(
                name
            );

            details.appendChild(
                status
            );


            info.appendChild(
                avatar
            );

            info.appendChild(
                details
            );


            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "online-call-button";


            button.dataset.userId =
                userId;


            button.dataset.userName =
                userName;


            button.textContent =
                isBusy
                    ? "Busy"
                    : "Call";


            if (isBusy) {

                button.classList.add(
                    "busy"
                );
            }


            item.appendChild(
                info
            );

            item.appendChild(
                button
            );


            onlineUsers.appendChild(
                item
            );
        }
    );
}


/* ============================================================
   CALL BUTTON
============================================================ */

if (onlineUsers) {

    onlineUsers.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".online-call-button"
                );


            if (!button) {
                return;
            }


            event.preventDefault();
            event.stopPropagation();


            const receiverId =
                String(
                    button.dataset.userId ||
                    ""
                ).trim();


            const receiverName =
                String(
                    button.dataset.userName ||
                    "User"
                ).trim();


            if (!receiverId) {

                alert(
                    "This user is unavailable."
                );

                return;
            }


            if (
                receiverId ===
                myUserId
            ) {

                return;
            }


            callUser(
                receiverId,
                receiverName
            );
        }
    );
}


/* ============================================================
   REFRESH USERS
============================================================ */

async function refreshOnlineUsers() {

    const ok =
        await registerPresence();


    if (ok) {

        await pollOnlineUsers();
    }
}


if (refreshUsersButton) {

    refreshUsersButton.addEventListener(
        "click",
        async event => {

            event.preventDefault();


            refreshUsersButton.disabled =
                true;


            try {

                await refreshOnlineUsers();

            } catch (error) {

                console.error(
                    "Refresh users error:",
                    error
                );

            } finally {

                setTimeout(
                    () => {

                        if (
                            refreshUsersButton
                        ) {

                            refreshUsersButton.disabled =
                                false;
                        }

                    },
                    500
                );
            }
        }
    );
}


/* ============================================================
   NAME CHANGE
============================================================ */

async function updateMyPresence() {

    const name =
        getMyName();


    if (!name) {

        try {

            localStorage.removeItem(
                "video_call_name"
            );

        } catch (_) {}


        clearOnlineUsers();

        setConnectionStatus(
            "Offline"
        );

        return;
    }


    saveMyName(name);


    const ok =
        await registerPresence();


    if (ok) {

        await pollOnlineUsers();
    }
}


if (nameInput) {

    nameInput.addEventListener(
        "input",
        () => {

            clearTimeout(
                nameUpdateTimer
            );


            nameUpdateTimer =
                setTimeout(
                    updateMyPresence,
                    400
                );
        }
    );


    nameInput.addEventListener(
        "change",
        updateMyPresence
    );


    nameInput.addEventListener(
        "blur",
        updateMyPresence
    );
}


/* ============================================================
   START PRESENCE
============================================================ */

async function startPresence() {

    if (presenceTimer) {

        clearInterval(
            presenceTimer
        );

        presenceTimer =
            null;
    }


    if (onlineUsersTimer) {

        clearInterval(
            onlineUsersTimer
        );

        onlineUsersTimer =
            null;
    }


    const savedName =
        loadMyName();


    if (!savedName) {

        setConnectionStatus(
            "Offline"
        );

        clearOnlineUsers();

        return;
    }


    /*
     * IMPORTANT:
     *
     * Register first.
     * Only after successful registration
     * poll the online users.
     */

    const registered =
        await registerPresence();


    if (registered) {

        await pollOnlineUsers();
    }


    /*
     * Heartbeat.
     *
     * Every 8 seconds tell Worker that
     * this user is still online.
     */

    presenceTimer =
        setInterval(
            async () => {

                const ok =
                    await registerPresence();


                if (ok) {

                    /*
                     * Also refresh the user list
                     * after heartbeat.
                     */

                    await pollOnlineUsers();
                }

            },
            8000
        );


    /*
     * Independent user-list refresh.
     */

    onlineUsersTimer =
        setInterval(
            async () => {

                if (
                    !presenceBusy &&
                    !usersPollBusy &&
                    getMyName()
                ) {

                    await pollOnlineUsers();
                }

            },
            2500
        );
}


/* ============================================================
   OFFLINE
============================================================ */

function setOffline() {

    const payload =
        JSON.stringify({
            userId:
                myUserId
        });


    try {

        if (
            navigator.sendBeacon
        ) {

            const blob =
                new Blob(
                    [payload],
                    {
                        type:
                            "application/json"
                    }
                );


            navigator.sendBeacon(
                API +
                "/presence/offline",
                blob
            );

            return;
        }

    } catch (_) {}


    try {

        fetch(
            API +
            "/presence/offline",
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    payload,

                keepalive:
                    true
            }
        );

    } catch (_) {}
}


window.addEventListener(
    "pagehide",
    setOffline
);

window.addEventListener(
    "beforeunload",
    setOffline
);


/* ============================================================
   INCOMING CALL POLLING
============================================================ */

async function pollIncomingCalls() {

    if (
        incomingCallVisible ||
        currentCallId
    ) {

        return;
    }


    try {

        const data =
            await apiRequest(
                "/call/poll",
                {
                    userId:
                        myUserId
                }
            );


        const calls =
            Array.isArray(data.calls)
                ? data.calls
                : [];


        const call =
            calls.find(
                item =>
                    item &&
                    String(
                        item.receiverId ||
                        ""
                    ) === myUserId &&
                    item.status ===
                        "ringing"
            );


        if (call) {

            showIncomingCall(
                call
            );
        }

    } catch (error) {

        console.error(
            "Incoming call error:",
            error
        );
    }
}


/* ============================================================
   INCOMING TIMER
============================================================ */

function startIncomingCallPolling() {

    if (incomingCallTimer) {

        clearInterval(
            incomingCallTimer
        );
    }


    pollIncomingCalls();


    incomingCallTimer =
        setInterval(
            pollIncomingCalls,
            1200
        );
}


/* ============================================================
   SHOW INCOMING
============================================================ */

function showIncomingCall(call) {

    if (!call) {
        return;
    }


    incomingCall =
        call;


    incomingCallVisible =
        true;


    if (incomingCallerName) {

        incomingCallerName.textContent =
            call.callerName ||
            "Someone";
    }


    if (incomingCallOverlay) {

        incomingCallOverlay.style.display =
            "flex";
    }
}


/* ============================================================
   HIDE INCOMING
============================================================ */

function hideIncomingCall() {

    incomingCallVisible =
        false;

    incomingCall =
        null;


    if (incomingCallOverlay) {

        incomingCallOverlay.style.display =
            "none";
    }
}


/* ============================================================
   ACCEPT
============================================================ */

async function acceptIncomingCall() {

    if (!incomingCall) {
        return;
    }


    const call =
        incomingCall;


    if (
        acceptCallButton
    ) {

        acceptCallButton.disabled =
            true;
    }


    if (
        declineCallButton
    ) {

        declineCallButton.disabled =
            true;
    }


    try {

        const data =
            await apiRequest(
                "/call/accept",
                {
                    callId:
                        call.callId,

                    userId:
                        myUserId
                }
            );


        const acceptedCall =
            data.call ||
            call;


        hideIncomingCall();


        currentCallId =
            acceptedCall.callId ||
            call.callId;


        currentCallRole =
            "receiver";


        currentRoom =
            acceptedCall.room ||
            call.room ||
            "";


        currentName =
            getMyName();


        if (!currentRoom) {

            throw new Error(
                "Call room is missing."
            );
        }


        await startJaaSCall(
            currentName,
            currentRoom
        );

    } catch (error) {

        console.error(
            "Accept error:",
            error
        );


        hideIncomingCall();


        alert(
            error.message ||
            "Unable to accept the call."
        );

    } finally {

        if (
            acceptCallButton
        ) {

            acceptCallButton.disabled =
                false;
        }


        if (
            declineCallButton
        ) {

            declineCallButton.disabled =
                false;
        }
    }
}


if (acceptCallButton) {

    acceptCallButton.addEventListener(
        "click",
        acceptIncomingCall
    );
}


/* ============================================================
   DECLINE
============================================================ */

async function declineIncomingCall() {

    if (!incomingCall) {
        return;
    }


    const call =
        incomingCall;


    if (
        acceptCallButton
    ) {

        acceptCallButton.disabled =
            true;
    }


    if (
        declineCallButton
    ) {

        declineCallButton.disabled =
            true;
    }


    try {

        await apiRequest(
            "/call/decline",
            {
                callId:
                    call.callId,

                userId:
                    myUserId
            }
        );

    } catch (error) {

        console.error(
            "Decline error:",
            error
        );

    } finally {

        hideIncomingCall();


        if (
            acceptCallButton
        ) {

            acceptCallButton.disabled =
                false;
        }


        if (
            declineCallButton
        ) {

            declineCallButton.disabled =
                false;
        }


        await pollOnlineUsers();
    }
}


if (declineCallButton) {

    declineCallButton.addEventListener(
        "click",
        declineIncomingCall
    );
}


/* ============================================================
   CALL USER
============================================================ */

async function callUser(
    receiverId,
    receiverName
) {

    receiverId =
        String(
            receiverId || ""
        ).trim();


    receiverName =
        String(
            receiverName ||
            "User"
        ).trim();


    const callerName =
        getMyName();


    if (!callerName) {

        alert(
            "Please enter your name first."
        );


        if (nameInput) {

            nameInput.focus();
        }


        return;
    }


    if (!receiverId) {

        alert(
            "This user is unavailable."
        );

        return;
    }


    if (
        receiverId ===
        myUserId
    ) {

        return;
    }


    if (currentCallId) {

        alert(
            "You are already in a call."
        );

        return;
    }


    currentName =
        callerName;


    currentReceiverId =
        receiverId;


    currentReceiverName =
        receiverName;


    const privateRoom =
        generatePrivateRoom();


    try {

        setConnectionStatus(
            "Calling..."
        );


        const data =
            await apiRequest(
                "/call",
                {
                    callerId:
                        myUserId,

                    callerName:
                        callerName,

                    receiverId:
                        receiverId,

                    receiverName:
                        receiverName,

                    room:
                        privateRoom
                }
            );


        const call =
            data.call ||
            data;


        currentCallId =
            String(
                call.callId ||
                ""
            );


        currentCallRole =
            "caller";


        currentRoom =
            String(
                call.room ||
                privateRoom
            );


        if (!currentCallId) {

            throw new Error(
                "Server did not return Call ID."
            );
        }


        showCallingScreen(
            receiverName
        );


        startOutgoingCallStatusPolling();

    } catch (error) {

        console.error(
            "Create call error:",
            error
        );


        hideCallingScreen();

        resetCallState();


        alert(
            error.message ||
            "Unable to start the call."
        );
    }
}


/* ============================================================
   CALLING UI
============================================================ */

function showCallingScreen(name) {

    if (callingReceiverName) {

        callingReceiverName.textContent =
            name || "User";
    }


    if (callingOverlay) {

        callingOverlay.style.display =
            "flex";
    }
}


function hideCallingScreen() {

    if (callingOverlay) {

        callingOverlay.style.display =
            "none";
    }
}


if (cancelCallButton) {

    cancelCallButton.addEventListener(
        "click",
        cancelOutgoingCall
    );
}


/* ============================================================
   CALL STATUS
============================================================ */

function startOutgoingCallStatusPolling() {

    stopOutgoingCallStatusPolling();

    checkOutgoingCallStatus();


    callStatusTimer =
        setInterval(
            checkOutgoingCallStatus,
            1000
        );
}


function stopOutgoingCallStatusPolling() {

    if (callStatusTimer) {

        clearInterval(
            callStatusTimer
        );

        callStatusTimer =
            null;
    }
}


async function checkOutgoingCallStatus() {

    if (!currentCallId) {
        return;
    }


    try {

        const data =
            await apiRequest(
                "/call/status",
                {
                    callId:
                        currentCallId,

                    userId:
                        myUserId
                }
            );


        const call =
            data.call ||
            data;


        const status =
            call.status ||
            data.status;


        if (
            status ===
            "accepted"
        ) {

            stopOutgoingCallStatusPolling();

            hideCallingScreen();


            await startJaaSCall(
                currentName,
                currentRoom
            );


            return;
        }


        if (
            status ===
            "declined"
        ) {

            stopOutgoingCallStatusPolling();

            hideCallingScreen();


            alert(
                (
                    currentReceiverName ||
                    "The user"
                ) +
                " declined the call."
            );


            resetCallState();

            return;
        }


        if (
            status ===
            "cancelled"
        ) {

            stopOutgoingCallStatusPolling();

            hideCallingScreen();

            resetCallState();

            return;
        }


        if (
            status ===
            "expired"
        ) {

            stopOutgoingCallStatusPolling();

            hideCallingScreen();


            alert(
                "The call expired."
            );


            resetCallState();

            return;
        }

    } catch (error) {

        console.error(
            "Call status error:",
            error
        );
    }
}


/* ============================================================
   CANCEL
============================================================ */

async function cancelOutgoingCall() {

    if (!currentCallId) {

        hideCallingScreen();

        return;
    }


    const callId =
        currentCallId;


    stopOutgoingCallStatusPolling();


    try {

        await apiRequest(
            "/call/cancel",
            {
                callId:
                    callId,

                userId:
                    myUserId
            }
        );

    } catch (error) {

        console.error(
            "Cancel error:",
            error
        );

    } finally {

        hideCallingScreen();

        resetCallState();

        await pollOnlineUsers();
    }
}


/* ============================================================
   LOAD JAAS
============================================================ */

function loadJaaSApi(appId) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (
                window.JitsiMeetExternalAPI
            ) {

                resolve(
                    window.JitsiMeetExternalAPI
                );

                return;
            }


            const script =
                document.createElement(
                    "script"
                );


            script.src =
                "https://" +
                JAAS_DOMAIN +
                "/" +
                appId +
                "/external_api.js";


            script.async = true;


            script.onload =
                () => {

                    if (
                        window.JitsiMeetExternalAPI
                    ) {

                        resolve(
                            window.JitsiMeetExternalAPI
                        );

                    } else {

                        reject(
                            new Error(
                                "JaaS API failed to load."
                            )
                        );
                    }
                };


            script.onerror =
                () => {

                    reject(
                        new Error(
                            "Unable to load JaaS API."
                        )
                    );
                };


            document.head.appendChild(
                script
            );
        }
    );
}


/* ============================================================
   START JAAS
============================================================ */

async function startJaaSCall(
    displayName,
    room
) {

    if (!room) {

        throw new Error(
            "Call room is missing."
        );
    }


    try {

        setConnectionStatus(
            "Connecting..."
        );


        const tokenData =
            await apiRequest(
                "/token",
                {
                    name:
                        displayName ||
                        "Guest",

                    room:
                        room
                }
            );


        if (
            !tokenData.appId ||
            !tokenData.token
        ) {

            throw new Error(
                "JaaS authentication failed."
            );
        }


        await loadJaaSApi(
            tokenData.appId
        );


        if (homeScreen) {

            homeScreen.style.display =
                "none";
        }


        if (callScreen) {

            callScreen.style.display =
                "flex";

            callScreen.classList.add(
                "active"
            );
        }


        if (roomLabel) {

            roomLabel.textContent =
                "Connected";
        }


        if (meet) {

            meet.innerHTML = "";
        }


        if (jitsiApi) {

            try {

                leavingJitsi = true;

                jitsiApi.dispose();

            } catch (_) {}


            jitsiApi = null;

            leavingJitsi = false;
        }


        const roomName =
            tokenData.appId +
            "/" +
            room;


        const options = {

            roomName:
                roomName,

            parentNode:
                meet,

            jwt:
                tokenData.token,

            width:
                "100%",

            height:
                "100%",

            userInfo: {

                displayName:
                    displayName ||
                    "Guest"
            },

            configOverwrite: {

                prejoinPageEnabled:
                    false,

                disableDeepLinking:
                    true,

                startWithAudioMuted:
                    false,

                startWithVideoMuted:
                    false
            },

            interfaceConfigOverwrite: {

                MOBILE_APP_PROMO:
                    false
            }
        };


        jitsiApi =
            new window.JitsiMeetExternalAPI(
                JAAS_DOMAIN,
                options
            );


        jitsiApi.addEventListener(
            "videoConferenceJoined",
            () => {

                setConnectionStatus(
                    "Connected"
                );
            }
        );


        jitsiApi.addEventListener(
            "videoConferenceLeft",
            () => {

                if (!leavingJitsi) {

                    leaveCall();
                }
            }
        );


        jitsiApi.addEventListener(
            "readyToClose",
            () => {

                if (!leavingJitsi) {

                    leaveCall();
                }
            }
        );

    } catch (error) {

        console.error(
            "JaaS error:",
            error
        );


        alert(
            error.message ||
            "Unable to join video call."
        );


        if (callScreen) {

            callScreen.classList.remove(
                "active"
            );

            callScreen.style.display =
                "none";
        }


        if (homeScreen) {

            homeScreen.style.display =
                "flex";
        }


        resetCallState();
    }
}


/* ============================================================
   LEAVE CALL
============================================================ */

async function leaveCall() {

    const callId =
        currentCallId;


    stopOutgoingCallStatusPolling();


    if (
        callId &&
        currentCallRole ===
            "caller"
    ) {

        try {

            await apiRequest(
                "/call/cancel",
                {
                    callId:
                        callId,

                    userId:
                        myUserId
                }
            );

        } catch (error) {

            console.error(
                "Leave signal error:",
                error
            );
        }
    }


    disposeJitsi();


    if (callScreen) {

        callScreen.classList.remove(
            "active"
        );

        callScreen.style.display =
            "none";
    }


    if (homeScreen) {

        homeScreen.style.display =
            "flex";
    }


    resetCallState();


    await registerPresence();

    await pollOnlineUsers();
}


/* ============================================================
   DISPOSE JAAS
============================================================ */

function disposeJitsi() {

    if (!jitsiApi) {
        return;
    }


    try {

        leavingJitsi = true;

        jitsiApi.dispose();

    } catch (error) {

        console.error(
            "Jitsi dispose error:",
            error
        );

    } finally {

        jitsiApi = null;

        leavingJitsi = false;
    }
}


/* ============================================================
   RESET
============================================================ */

function resetCallState() {

    currentCallId = "";
    currentCallRole = "";
    currentRoom = "";
    currentReceiverId = "";
    currentReceiverName = "";


    stopOutgoingCallStatusPolling();

    hideCallingScreen();

    hideIncomingCall();


    setConnectionStatus(
        getMyName()
            ? "Online"
            : "Offline"
    );
}


/* ============================================================
   BACK
============================================================ */

if (backButton) {

    backButton.addEventListener(
        "click",
        async () => {

            if (currentCallId) {

                const leave =
                    confirm(
                        "Leave this call?"
                    );


                if (!leave) {
                    return;
                }


                await leaveCall();

                return;
            }


            disposeJitsi();


            if (callScreen) {

                callScreen.classList.remove(
                    "active"
                );

                callScreen.style.display =
                    "none";
            }


            if (homeScreen) {

                homeScreen.style.display =
                    "flex";
            }


            resetCallState();
        }
    );
}


/* ============================================================
   INITIALIZE
============================================================ */

(async function initialize() {

    console.log(
        "===================================="
    );

    console.log(
        "1v1 Video Call initializing..."
    );

    console.log(
        "My User ID:",
        myUserId
    );


    const savedName =
        loadMyName();


    console.log(
        "Saved Name:",
        savedName
    );


    /*
     * Start presence only after DOM is ready.
     */

    await startPresence();


    /*
     * Incoming calls.
     */

    startIncomingCallPolling();


    console.log(
        "1v1 Video Call initialized."
    );

    console.log(
        "Online presence started."
    );

})();
    

/* ============================================================
   DEBUG
============================================================ */

window.getMyUserId =
    () => myUserId;


window.getMyName =
    () => getMyName();


window.testPresence =
    async () => {

        console.log(
            "========== PRESENCE TEST =========="
        );

        console.log(
            "MY USER ID:",
            myUserId
        );

        console.log(
            "MY NAME:",
            getMyName()
        );

        console.log(
            "API:",
            API
        );


        const registered =
            await registerPresence();


        console.log(
            "REGISTER RESULT:",
            registered
        );


        const polled =
            await pollOnlineUsers();


        console.log(
            "POLL RESULT:",
            polled
        );


        console.log(
            "===================================="
        );
    };
