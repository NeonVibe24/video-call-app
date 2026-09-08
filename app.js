"use strict";

/* ============================================================
   DOM
============================================================ */

const homeScreen = document.getElementById("homeScreen");
const callScreen = document.getElementById("callScreen");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const joinButton = document.getElementById("joinButton");
const createButton = document.getElementById("createButton");

const backButton = document.getElementById("backButton");
const copyButton = document.getElementById("copyButton");

const roomLabel = document.getElementById("roomLabel");
const meet = document.getElementById("meet");

const onlineUsers = document.getElementById("onlineUsers");
const onlineCount = document.getElementById("onlineCount");
const refreshUsersButton =
    document.getElementById("refreshUsersButton");
const noUsersMessage =
    document.getElementById("noUsersMessage");

const connectionStatus =
    document.getElementById("connectionStatus");


/* ============================================================
   INCOMING CALL UI
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
   OUTGOING CALL UI
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
   USER / CALL STATE
============================================================ */

let currentRoom = "";
let currentName = "";

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

let leavingJitsi = false;

let nameUpdateTimer = null;


/* ============================================================
   INTERNAL USER ID
   User never enters or sees this.
============================================================ */

function getUserId() {

    let userId = null;

    try {
        userId =
            localStorage.getItem(
                "video_call_user_id"
            );
    } catch (_) {}

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

const myUserId = getUserId();


/* ============================================================
   NAME STORAGE
============================================================ */

function saveMyName(name) {

    try {

        localStorage.setItem(
            "video_call_name",
            String(name || "").trim()
        );

    } catch (_) {}
}


function loadMyName() {

    try {

        const saved =
            localStorage.getItem(
                "video_call_name"
            );

        if (
            saved &&
            nameInput &&
            !nameInput.value
        ) {

            nameInput.value =
                saved;
        }

    } catch (_) {}
}


/* ============================================================
   CONNECTION STATUS
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
    body,
    options = {}
) {

    const fetchOptions = {

        method: "POST",

        headers: {
            "Content-Type":
                "application/json"
        },

        body:
            JSON.stringify(
                body || {}
            )
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
            "Request failed."

        );
    }


    return data;
}


/* ============================================================
   ROOM HELPERS
============================================================ */

function generateRoom() {

    const chars =
        "abcdefghijklmnopqrstuvwxyz" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "0123456789";

    let result = "";

    for (
        let i = 0;
        i < 10;
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

    return result;
}


function cleanRoom(value) {

    return String(value || "")
        .trim()
        .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
        )
        .slice(0, 40);
}


/* ============================================================
   NAME HELPERS
============================================================ */

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
   ONLINE PRESENCE
============================================================ */

async function registerPresence() {

    const name =
        getMyName();

    if (!name) {

        setConnectionStatus(
            "Offline"
        );

        renderOnlineUsers([]);

        return;
    }


    saveMyName(name);


    try {

        await apiRequest(
            "/presence/online",
            {
                userId:
                    myUserId,

                name:
                    name
            }
        );


        setConnectionStatus(
            "Online"
        );

    } catch (error) {

        console.error(
            "Presence online error:",
            error
        );

        setConnectionStatus(
            "Reconnecting..."
        );
    }
}


/* ============================================================
   POLL ONLINE USERS
============================================================ */

async function pollOnlineUsers() {

    const name =
        getMyName();

    if (!name) {

        renderOnlineUsers([]);

        return;
    }


    try {

        const data =
            await apiRequest(
                "/presence/poll",
                {
                    userId:
                        myUserId
                }
            );


        renderOnlineUsers(
            Array.isArray(
                data.users
            )
                ? data.users
                : []
        );

    } catch (error) {

        console.error(
            "Online users error:",
            error
        );
    }
}


/* ============================================================
   RENDER ONLINE USERS
============================================================ */

function renderOnlineUsers(users) {

    if (!onlineUsers) {

        console.error(
            "onlineUsers element not found."
        );

        return;
    }


    onlineUsers.innerHTML = "";


    const list =
        Array.isArray(users)
            ? users
            : [];


    if (onlineCount) {

        onlineCount.textContent =
            String(list.length);
    }


    if (list.length === 0) {

        if (noUsersMessage) {

            noUsersMessage.style.display =
                "block";

            onlineUsers.appendChild(
                noUsersMessage
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

            if (
                !user ||
                !user.userId
            ) {
                return;
            }


            /* -----------------------------------------
               USER ITEM
            ----------------------------------------- */

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "online-user-item";


            /* -----------------------------------------
               USER INFO
            ----------------------------------------- */

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
                    user.name
                );


            const details =
                document.createElement(
                    "div"
                );


            const userName =
                document.createElement(
                    "div"
                );

            userName.className =
                "online-user-name";

            userName.textContent =
                user.name ||
                "Unknown User";


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


            const isBusy =
                String(
                    user.status || ""
                ).toLowerCase() ===
                "busy";


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
                userName
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


            /* -----------------------------------------
               CALL BUTTON
            ----------------------------------------- */

            const callButton =
                document.createElement(
                    "button"
                );


            callButton.type =
                "button";


            callButton.className =
                "online-call-button";


            callButton.textContent =
                isBusy
                    ? "Busy"
                    : "Call";


            callButton.disabled =
                isBusy;


            if (!isBusy) {

                callButton.onclick =
                    function (event) {

                        event.preventDefault();
                        event.stopPropagation();


                        console.log(
                            "CALL BUTTON CLICKED"
                        );


                        console.log(
                            "Receiver:",
                            user.name
                        );


                        callUser(
                            String(
                                user.userId
                            ),
                            String(
                                user.name ||
                                "User"
                            )
                        );
                    };
            }


            item.appendChild(
                info
            );

            item.appendChild(
                callButton
            );


            onlineUsers.appendChild(
                item
            );
        }
    );
}


/* ============================================================
   REFRESH ONLINE USERS
============================================================ */

async function refreshOnlineUsers() {

    await registerPresence();

    await pollOnlineUsers();
}


window.refreshOnlineUsers =
    refreshOnlineUsers;


/* ============================================================
   UPDATE MY PRESENCE
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


        renderOnlineUsers([]);

        setConnectionStatus(
            "Offline"
        );

        return;
    }


    saveMyName(name);

    await registerPresence();

    await pollOnlineUsers();
}


/* ============================================================
   NAME INPUT
============================================================ */

if (nameInput) {

    nameInput.addEventListener(
        "input",
        () => {

            clearTimeout(
                nameUpdateTimer
            );


            nameUpdateTimer =
                setTimeout(
                    () => {
                        updateMyPresence();
                    },
                    400
                );
        }
    );


    nameInput.addEventListener(
        "change",
        () => {
            updateMyPresence();
        }
    );
}


/* ============================================================
   START PRESENCE
============================================================ */

function startPresence() {

    if (presenceTimer) {

        clearInterval(
            presenceTimer
        );
    }


    if (onlineUsersTimer) {

        clearInterval(
            onlineUsersTimer
        );
    }


    registerPresence();

    pollOnlineUsers();


    presenceTimer =
        setInterval(
            () => {

                registerPresence();

            },
            10000
        );


    onlineUsersTimer =
        setInterval(
            () => {

                pollOnlineUsers();

            },
            5000
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
    "beforeunload",
    setOffline
);


/* ============================================================
   INCOMING CALL POLLING
============================================================ */

async function pollIncomingCalls() {

    if (incomingCallVisible) {
        return;
    }


    if (currentCallId) {
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
            Array.isArray(
                data.calls
            )
                ? data.calls
                : [];


        const call =
            calls.find(
                item =>
                    item &&
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
            "Incoming call polling error:",
            error
        );
    }
}


/* ============================================================
   START INCOMING CALL POLLING
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
            () => {

                pollIncomingCalls();

            },
            1500
        );
}


/* ============================================================
   SHOW INCOMING CALL
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
            "Unknown User";
    }


    if (incomingCallOverlay) {

        incomingCallOverlay.style.display =
            "flex";
    }
}


/* ============================================================
   HIDE INCOMING CALL
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
   ACCEPT INCOMING CALL
============================================================ */

async function acceptIncomingCall() {

    if (!incomingCall) {
        return;
    }


    const call =
        incomingCall;


    if (acceptCallButton) {
        acceptCallButton.disabled =
            true;
    }


    if (declineCallButton) {
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
            "Accept call error:",
            error
        );


        hideIncomingCall();


        alert(
            error.message ||
            "Unable to accept the call."
        );

    } finally {

        if (acceptCallButton) {
            acceptCallButton.disabled =
                false;
        }


        if (declineCallButton) {
            declineCallButton.disabled =
                false;
        }
    }
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


    if (acceptCallButton) {
        acceptCallButton.disabled =
            true;
    }


    if (declineCallButton) {
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
            "Decline call error:",
            error
        );

    } finally {

        hideIncomingCall();


        if (acceptCallButton) {
            acceptCallButton.disabled =
                false;
        }


        if (declineCallButton) {
            declineCallButton.disabled =
                false;
        }


        pollOnlineUsers();
    }
}


if (acceptCallButton) {

    acceptCallButton.addEventListener(
        "click",
        acceptIncomingCall
    );
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

    console.log(
        "callUser()",
        receiverId,
        receiverName
    );


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

        alert(
            "You cannot call yourself."
        );


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
        receiverName ||
        "User";


    const room =
        generateRoom();


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
                        currentReceiverName,

                    room:
                        room
                }
            );


        /* ==================================================
           IMPORTANT:
           Worker returns { ok, call }
        ================================================== */

        const createdCall =
            data.call ||
            data;


        currentCallId =
            createdCall.callId ||
            data.callId ||
            "";


        currentCallRole =
            "caller";


        currentRoom =
            createdCall.room ||
            data.room ||
            room;


        if (!currentCallId) {

            throw new Error(
                "Server did not return a Call ID."
            );
        }


        showCallingScreen(
            currentReceiverName
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


window.callUser =
    callUser;


/* ============================================================
   CALLING OVERLAY
============================================================ */

function showCallingScreen(
    receiverName
) {

    if (callingReceiverName) {

        callingReceiverName.textContent =
            receiverName ||
            "User";
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
   OUTGOING CALL STATUS POLLING
============================================================ */

function startOutgoingCallStatusPolling() {

    stopOutgoingCallStatusPolling();


    checkOutgoingCallStatus();


    callStatusTimer =
        setInterval(
            () => {

                checkOutgoingCallStatus();

            },
            1200
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


/* ============================================================
   CHECK OUTGOING CALL STATUS
============================================================ */

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


            currentCallRole =
                "caller";


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


            await pollOnlineUsers();


            return;
        }


        if (
            status ===
            "cancelled"
        ) {

            stopOutgoingCallStatusPolling();

            hideCallingScreen();

            resetCallState();

            await pollOnlineUsers();

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


            await pollOnlineUsers();

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
   CANCEL OUTGOING CALL
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
            "Cancel call error:",
            error
        );

    } finally {

        hideCallingScreen();

        resetCallState();

        pollOnlineUsers();
    }
}


/* ============================================================
   LOAD JAAS API
============================================================ */

function loadJaaSApi(
    appId
) {

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


            script.async =
                true;


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
   START JAAS CALL
============================================================ */

async function startJaaSCall(
    displayName,
    room
) {

    if (!room) {

        alert(
            "Call room is missing."
        );


        resetCallState();

        return;
    }


    try {

        if (joinButton) {
            joinButton.disabled =
                true;
        }


        if (createButton) {
            createButton.disabled =
                true;
        }


        setConnectionStatus(
            "Connecting..."
        );


        /* ==================================================
           IMPORTANT:
           Worker requires name + room
        ================================================== */

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


        const appId =
            tokenData.appId;


        const jwt =
            tokenData.token;


        if (!appId) {

            throw new Error(
                "JaaS App ID is missing."
            );
        }


        if (!jwt) {

            throw new Error(
                "JaaS JWT token is missing."
            );
        }


        await loadJaaSApi(
            appId
        );


        /* ==================================================
           SHOW CALL SCREEN
        ================================================== */

        if (homeScreen) {

            homeScreen.style.display =
                "none";
        }


        if (callScreen) {

            callScreen.classList.add(
                "active"
            );

            callScreen.style.display =
                "flex";
        }


        if (roomLabel) {

            roomLabel.textContent =
                room;
        }


        if (meet) {

            meet.innerHTML = "";
        }


        /* ==================================================
           DISPOSE OLD JITSI
        ================================================== */

        if (jitsiApi) {

            try {

                leavingJitsi =
                    true;

                jitsiApi.dispose();

            } catch (_) {}


            jitsiApi =
                null;

            leavingJitsi =
                false;
        }


        /* ==================================================
           JAAS ROOM
        ================================================== */

        const roomName =
            appId +
            "/" +
            room;


        const options = {

            roomName:
                roomName,

            parentNode:
                meet,

            jwt:
                jwt,

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


        /* ==================================================
           JAAS EVENTS
        ================================================== */

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


        setConnectionStatus(
            "Connecting..."
        );


    } catch (error) {

        console.error(
            "JaaS error:",
            error
        );


        alert(
            error.message ||
            "Unable to join the video call."
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


    } finally {

        if (joinButton) {
            joinButton.disabled =
                false;
        }


        if (createButton) {
            createButton.disabled =
                false;
        }
    }
}


/* ============================================================
   LEAVE ACTIVE CALL
============================================================ */

async function leaveCall() {

    const callId =
        currentCallId;


    stopOutgoingCallStatusPolling();


    if (callId) {

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
                "Leave call signal error:",
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
   DISPOSE JITSI
============================================================ */

function disposeJitsi() {

    if (!jitsiApi) {
        return;
    }


    try {

        leavingJitsi =
            true;

        jitsiApi.dispose();

    } catch (error) {

        console.error(
            "Jitsi dispose error:",
            error
        );

    } finally {

        jitsiApi =
            null;

        leavingJitsi =
            false;
    }
}


/* ============================================================
   RESET CALL STATE
============================================================ */

function resetCallState() {

    currentCallId =
        "";

    currentCallRole =
        "";

    currentRoom =
        "";

    currentReceiverId =
        "";

    currentReceiverName =
        "";

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
   JOIN ROOM
============================================================ */

async function joinRoom() {

    const name =
        getMyName();


    if (!name) {

        alert(
            "Please enter your name first."
        );


        if (nameInput) {
            nameInput.focus();
        }


        return;
    }


    const room =
        cleanRoom(
            roomInput
                ? roomInput.value
                : ""
        );


    if (!room) {

        alert(
            "Please enter a room code."
        );


        if (roomInput) {
            roomInput.focus();
        }


        return;
    }


    saveMyName(name);


    currentName =
        name;


    currentRoom =
        room;


    currentCallRole =
        "direct";


    await startJaaSCall(
        name,
        room
    );
}


if (joinButton) {

    joinButton.addEventListener(
        "click",
        joinRoom
    );
}


/* ============================================================
   CREATE ROOM
============================================================ */

async function createRoom() {

    const name =
        getMyName();


    if (!name) {

        alert(
            "Please enter your name first."
        );


        if (nameInput) {
            nameInput.focus();
        }


        return;
    }


    const room =
        generateRoom();


    if (roomInput) {

        roomInput.value =
            room;
    }


    saveMyName(name);


    currentName =
        name;


    currentRoom =
        room;


    currentCallRole =
        "direct";


    await startJaaSCall(
        name,
        room
    );
}


if (createButton) {

    createButton.addEventListener(
        "click",
        createRoom
    );
}


/* ============================================================
   COPY ROOM
============================================================ */

async function copyRoomCode() {

    const room =
        currentRoom ||
        (
            roomInput
                ? roomInput.value
                : ""
        );


    if (!room) {
        return;
    }


    try {

        await navigator.clipboard.writeText(
            room
        );

    } catch (_) {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            room;


        textarea.style.position =
            "fixed";


        textarea.style.opacity =
            "0";


        document.body.appendChild(
            textarea
        );


        textarea.focus();

        textarea.select();


        try {

            document.execCommand(
                "copy"
            );

        } catch (_) {}


        textarea.remove();
    }


    if (copyButton) {

        const oldText =
            copyButton.textContent;


        copyButton.textContent =
            "Copied!";


        setTimeout(
            () => {

                copyButton.textContent =
                    oldText ||
                    "Copy";

            },
            1200
        );
    }
}


if (copyButton) {

    copyButton.addEventListener(
        "click",
        copyRoomCode
    );
}


/* ============================================================
   BACK BUTTON
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
   REFRESH USERS
============================================================ */

if (refreshUsersButton) {

    refreshUsersButton.addEventListener(
        "click",
        async () => {

            refreshUsersButton.disabled =
                true;


            try {

                await refreshOnlineUsers();

            } finally {

                setTimeout(
                    () => {

                        refreshUsersButton.disabled =
                            false;

                    },
                    500
                );
            }
        }
    );
}


/* ============================================================
   ROOM ENTER
============================================================ */

if (roomInput) {

    roomInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                joinRoom();
            }
        }
    );
}


/* ============================================================
   INITIALIZE
============================================================ */

loadMyName();

startPresence();

startIncomingCallPolling();


/* ============================================================
   DEBUG
============================================================ */

window.getMyUserId =
    function () {
        return myUserId;
    };


window.getMyName =
    function () {
        return getMyName();
    };
