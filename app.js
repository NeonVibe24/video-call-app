"use strict";


/* ============================================================
   ELEMENTS
============================================================ */

const homeScreen =
    document.getElementById("homeScreen");

const callScreen =
    document.getElementById("callScreen");

const nameInput =
    document.getElementById("nameInput");

const roomInput =
    document.getElementById("roomInput");

const joinButton =
    document.getElementById("joinButton");

const createButton =
    document.getElementById("createButton");

const backButton =
    document.getElementById("backButton");

const copyButton =
    document.getElementById("copyButton");

const roomLabel =
    document.getElementById("roomLabel");

const meet =
    document.getElementById("meet");


/* ============================================================
   ONLINE USER ELEMENTS
============================================================ */

const onlineUsers =
    document.getElementById("onlineUsers");

const onlineCount =
    document.getElementById("onlineCount");

const noUsersMessage =
    document.getElementById("noUsersMessage");

const refreshUsersButton =
    document.getElementById("refreshUsersButton");

const connectionStatus =
    document.getElementById("connectionStatus");


/* ============================================================
   INCOMING CALL ELEMENTS
============================================================ */

const incomingCallOverlay =
    document.getElementById(
        "incomingCallOverlay"
    );

const incomingCallerName =
    document.getElementById(
        "incomingCallerName"
    );

const acceptCallButton =
    document.getElementById(
        "acceptCallButton"
    );

const declineCallButton =
    document.getElementById(
        "declineCallButton"
    );


/* ============================================================
   OUTGOING CALL ELEMENTS
============================================================ */

const callingOverlay =
    document.getElementById(
        "callingOverlay"
    );

const callingReceiverName =
    document.getElementById(
        "callingReceiverName"
    );

const cancelCallButton =
    document.getElementById(
        "cancelCallButton"
    );


/* ============================================================
   STATE
============================================================ */

let jitsiApi = null;

let currentRoom = "";

let currentName = "";

let currentCallId = "";

let currentCallRole = "";

let currentReceiverId = "";

let currentReceiverName = "";

let callStatusTimer = null;

let incomingCallTimer = null;

let presenceTimer = null;

let onlineUsersTimer = null;

let incomingCallVisible = false;

let presenceStarted = false;

let leavingCall = false;

let startingJaaS = false;


/* ============================================================
   API
============================================================ */

const API =
    "/api";


/* ============================================================
   TIMING
============================================================ */

const PRESENCE_INTERVAL =
    10000;

const ONLINE_USERS_INTERVAL =
    5000;

const CALL_POLL_INTERVAL =
    1500;


/* ============================================================
   USER ID
============================================================ */

/*
 * User ID is generated automatically.
 *
 * The user never needs to see or enter it.
 */

function getUserId() {

    let userId =
        localStorage.getItem(
            "video_call_user_id"
        );


    if (!userId) {

        if (
            typeof crypto !==
            "undefined" &&
            typeof crypto.randomUUID ===
            "function"
        ) {

            userId =
                crypto.randomUUID();

        } else {

            userId =
                "u_" +
                Date.now() +
                "_" +
                Math.random()
                    .toString(36)
                    .slice(2, 12);

        }


        localStorage.setItem(
            "video_call_user_id",
            userId
        );

    }


    return userId;

}


const myUserId =
    getUserId();


/* ============================================================
   NAME STORAGE
============================================================ */

function saveMyName(
    name
) {

    try {

        localStorage.setItem(
            "video_call_name",
            name
        );

    } catch (_) {}

}


/* ============================================================
   LOAD NAME
============================================================ */

function loadMyName() {

    try {

        const saved =
            localStorage.getItem(
                "video_call_name"
            );


        if (
            saved &&
            !nameInput.value
        ) {

            nameInput.value =
                saved;

        }

    } catch (_) {}

}


loadMyName();


/* ============================================================
   SAFE TEXT
============================================================ */

function escapeHTML(
    value
) {

    return String(
        value || ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* ============================================================
   USER INITIAL
============================================================ */

function getUserInitial(
    name
) {

    const value =
        String(
            name || "U"
        ).trim();


    if (!value) {

        return "U";

    }


    return value
        .charAt(0)
        .toUpperCase();

}


/* ============================================================
   API REQUEST
============================================================ */

async function apiRequest(
    path,
    body
) {

    const response =
        await fetch(
            API + path,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify(
                        body || {}
                    )

            }
        );


    let data = {};


    try {

        data =
            await response.json();

    } catch (_) {

        data = {};

    }


    if (!response.ok) {

        throw new Error(
            data.error ||
            "Request failed."
        );

    }


    return data;

}


/* ============================================================
   CONNECTION STATUS
============================================================ */

function setConnectionStatus(
    online
) {

    if (!connectionStatus) {

        return;

    }


    connectionStatus.textContent =
        online
            ? "Online"
            : "Offline";

}


/* ============================================================
   PRESENCE
============================================================ */

async function updateMyPresence() {

    const name =
        nameInput.value.trim();


    if (!name) {

        return;

    }


    if (name.length > 40) {

        return;

    }


    currentName =
        name;


    saveMyName(
        name
    );


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


        presenceStarted =
            true;


        setConnectionStatus(
            true
        );


    } catch (error) {

        console.warn(
            "Presence error:",
            error
        );


        setConnectionStatus(
            false
        );

    }

}


/* ============================================================
   START PRESENCE HEARTBEAT
============================================================ */

function startPresenceHeartbeat() {

    if (
        presenceTimer
    ) {

        clearInterval(
            presenceTimer
        );

    }


    updateMyPresence();


    presenceTimer =
        setInterval(
            updateMyPresence,
            PRESENCE_INTERVAL
        );

}


/* ============================================================
   STOP PRESENCE
============================================================ */

function stopPresenceHeartbeat() {

    if (
        presenceTimer
    ) {

        clearInterval(
            presenceTimer
        );

        presenceTimer =
            null;

    }

}


/* ============================================================
   GET ONLINE USERS
============================================================ */

async function loadOnlineUsers() {

    const name =
        nameInput.value.trim();


    if (!name) {

        renderOnlineUsers(
            []
        );

        return;

    }


    try {

        const data =
            await apiRequest(
                "/presence/users",
                {

                    userId:
                        myUserId

                }
            );


        const users =
            Array.isArray(
                data.users
            )
                ? data.users
                : [];


        renderOnlineUsers(
            users
        );


        setConnectionStatus(
            true
        );


    } catch (error) {

        console.warn(
            "Online users error:",
            error
        );


        setConnectionStatus(
            false
        );

    }

}


/* ============================================================
   RENDER ONLINE USERS
============================================================ */

function renderOnlineUsers(
    users
) {

    if (!onlineUsers) {

        return;

    }


    if (!Array.isArray(users)) {

        users = [];

    }


    /*
     * Never show current user.
     */

    users =
        users.filter(
            user =>
                user &&
                user.userId &&
                user.userId !== myUserId
        );


    if (onlineCount) {

        onlineCount.textContent =
            String(
                users.length
            );

    }


    if (!users.length) {

        onlineUsers.innerHTML = `

            <div
                id="noUsersMessage"
                class="no-users"
            >

                <div class="no-users-icon">
                    👥
                </div>

                <div>
                    No other users online
                </div>

                <small>
                    Online users will appear here.
                </small>

            </div>

        `;


        return;

    }


    onlineUsers.innerHTML =
        users
            .map(
                user =>
                    createOnlineUserHTML(
                        user
                    )
            )
            .join("");


    /*
     * Attach Call button events.
     */

    const buttons =
        onlineUsers.querySelectorAll(
            ".online-user-call"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async () => {

                    const receiverId =
                        button.dataset.userId;

                    const receiverName =
                        button.dataset.userName ||
                        "User";


                    if (!receiverId) {

                        return;

                    }


                    /*
                     * Prevent double click.
                     */

                    button.disabled =
                        true;


                    try {

                        await callUser(
                            receiverId,
                            receiverName
                        );

                    } finally {

                        /*
                         * If call is still not active,
                         * restore button.
                         */

                        if (
                            !currentCallId
                        ) {

                            button.disabled =
                                false;

                        }

                    }

                }
            );

        }
    );

}


/* ============================================================
   CREATE ONLINE USER HTML
============================================================ */

function createOnlineUserHTML(
    user
) {

    const userId =
        String(
            user.userId || ""
        );


    const userName =
        String(
            user.name ||
            user.username ||
            "User"
        );


    const initial =
        getUserInitial(
            userName
        );


    const isBusy =
        user.status ===
        "busy";


    const safeName =
        escapeHTML(
            userName
        );


    const encodedName =
        encodeURIComponent(
            userName
        );


    if (isBusy) {

        return `

            <div
                class="online-user busy"
            >

                <div
                    class="online-user-avatar"
                >
                    ${escapeHTML(initial)}
                </div>


                <div
                    class="online-user-info"
                >

                    <div
                        class="online-user-name"
                    >
                        ${safeName}
                    </div>

                    <div
                        class="online-user-busy"
                    >
                        Busy
                    </div>

                </div>


                <button
                    type="button"
                    class="online-user-call busy-button"
                    disabled
                >
                    Busy
                </button>

            </div>

        `;

    }


    return `

        <div
            class="online-user"
        >

            <div
                class="online-user-avatar"
            >
                ${escapeHTML(initial)}
            </div>


            <div
                class="online-user-info"
            >

                <div
                    class="online-user-name"
                >
                    ${safeName}
                </div>

                <div
                    class="online-user-status"
                >
                    ● Online
                </div>

            </div>


            <button
                type="button"
                class="online-user-call"
                data-user-id="${escapeHTML(userId)}"
                data-user-name="${escapeHTML(userName)}"
            >
                📞 Call
            </button>

        </div>

    `;

}


/* ============================================================
   START ONLINE USER POLLING
============================================================ */

function startOnlineUsersPolling() {

    if (
        onlineUsersTimer
    ) {

        clearInterval(
            onlineUsersTimer
        );

    }


    loadOnlineUsers();


    onlineUsersTimer =
        setInterval(
            loadOnlineUsers,
            ONLINE_USERS_INTERVAL
        );

}


/* ============================================================
   LOAD JaaS API
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
                typeof JitsiMeetExternalAPI !==
                "undefined"
            ) {

                resolve();

                return;

            }


            const oldScript =
                document.querySelector(
                    "script[data-jaas-api]"
                );


            if (oldScript) {

                oldScript.addEventListener(
                    "load",
                    () => resolve(),
                    {
                        once: true
                    }
                );


                oldScript.addEventListener(
                    "error",
                    () =>
                        reject(
                            new Error(
                                "JaaS API failed to load."
                            )
                        ),
                    {
                        once: true
                    }
                );


                return;

            }


            const script =
                document.createElement(
                    "script"
                );


            script.src =
                "https://8x8.vc/" +
                encodeURIComponent(
                    appId
                ) +
                "/external_api.js";


            script.async =
                true;


            script.dataset.jaasApi =
                "true";


            script.onload =
                () => {

                    resolve();

                };


            script.onerror =
                () => {

                    reject(
                        new Error(
                            "Could not load JaaS IFrame API."
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
   GENERATE ROOM
============================================================ */

function generateRoom() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    let room =
        "";


    for (
        let i = 0;
        i < 10;
        i++
    ) {

        room +=
            chars[
                Math.floor(
                    Math.random() *
                    chars.length
                )
            ];

    }


    return room;

}


/* ============================================================
   CLEAN ROOM
============================================================ */

function cleanRoom(
    value
) {

    return String(
        value || ""
    )
        .trim()
        .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
        )
        .slice(
            0,
            40
        );

}


/* ============================================================
   INCOMING CALL
============================================================ */

function showIncomingCall(
    call
) {

    if (
        incomingCallVisible
    ) {

        return;

    }


    if (
        currentCallId
    ) {

        return;

    }


    if (!call) {

        return;

    }


    incomingCallVisible =
        true;


    window.__incomingCall =
        call;


    if (incomingCallerName) {

        incomingCallerName.textContent =
            call.callerName ||
            "Someone";

    }


    if (incomingCallOverlay) {

        incomingCallOverlay.style.display =
            "flex";

    }


    /*
     * If another old timer exists,
     * remove it.
     */

    if (
        incomingCallTimer
    ) {

        clearInterval(
            incomingCallTimer
        );

        incomingCallTimer =
            null;

    }

}


/* ============================================================
   HIDE INCOMING CALL
============================================================ */

function hideIncomingCall() {

    incomingCallVisible =
        false;


    window.__incomingCall =
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

    const call =
        window.__incomingCall;


    if (!call) {

        return;

    }


    if (
        !call.callId
    ) {

        hideIncomingCall();

        return;

    }


    if (acceptCallButton) {

        acceptCallButton.disabled =
            true;

        acceptCallButton.textContent =
            "Connecting...";

    }


    try {

        const name =
            nameInput.value.trim();


        if (!name) {

            throw new Error(
                "Please enter your name first."
            );

        }


        currentName =
            name;


        saveMyName(
            name
        );


        await updateMyPresence();


        await apiRequest(
            "/call/accept",
            {

                callId:
                    call.callId,

                userId:
                    myUserId

            }
        );


        currentCallId =
            call.callId;


        currentCallRole =
            "receiver";


        currentReceiverId =
            call.callerId ||
            "";

        currentReceiverName =
            call.callerName ||
            "User";


        currentRoom =
            call.room ||
            "";


        hideIncomingCall();


        /*
         * IMPORTANT:
         *
         * JaaS opens only after
         * receiver accepts.
         */

        await startJaaSCall(
            currentName,
            currentRoom
        );


    } catch (error) {

        console.error(
            "Accept call error:",
            error
        );


        alert(
            error.message ||
            "Could not accept the call."
        );


        hideIncomingCall();


    } finally {

        if (acceptCallButton) {

            acceptCallButton.disabled =
                false;

            acceptCallButton.textContent =
                "Accept";

        }

    }

}


/* ============================================================
   DECLINE INCOMING CALL
============================================================ */

async function declineIncomingCall() {

    const call =
        window.__incomingCall;


    if (!call) {

        return;

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

        console.warn(
            "Decline call error:",
            error
        );

    }


    hideIncomingCall();


    if (declineCallButton) {

        declineCallButton.disabled =
            false;

    }

}


/* ============================================================
   POLL INCOMING CALLS
============================================================ */

async function pollIncomingCalls() {

    if (
        incomingCallVisible
    ) {

        return;

    }


    if (
        currentCallId
    ) {

        return;

    }


    const name =
        nameInput.value.trim();


    if (!name) {

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


        if (
            data &&
            Array.isArray(
                data.calls
            ) &&
            data.calls.length > 0
        ) {

            const call =
                data.calls.find(
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

        }

    } catch (error) {

        console.warn(
            "Incoming call polling error:",
            error
        );

    }

}


/* ============================================================
   START INCOMING CALL POLLING
============================================================ */

function startIncomingCallPolling() {

    if (
        incomingCallTimer
    ) {

        clearInterval(
            incomingCallTimer
        );

    }


    pollIncomingCalls();


    incomingCallTimer =
        setInterval(
            pollIncomingCalls,
            CALL_POLL_INTERVAL
        );

}


/* ============================================================
   CREATE OUTGOING CALL
============================================================ */

async function createOutgoingCall(
    receiverId,
    receiverName,
    callerName
) {

    if (
        !receiverId
    ) {

        throw new Error(
            "Selected user is not available."
        );

    }


    if (
        receiverId ===
        myUserId
    ) {

        throw new Error(
            "You cannot call yourself."
        );

    }


    const room =
        generateRoom();


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
                    room

            }
        );


    if (
        !data.call
    ) {

        throw new Error(
            "Could not create call."
        );

    }


    currentCallId =
        data.call.callId;


    currentCallRole =
        "caller";


    currentName =
        callerName;


    currentRoom =
        room;


    currentReceiverId =
        receiverId;


    currentReceiverName =
        receiverName ||
        "User";


    /*
     * Caller waits here.
     *
     * JaaS does NOT open yet.
     */

    showCallingOverlay(
        currentReceiverName
    );


    startCallStatusPolling();

}


/* ============================================================
   SHOW CALLING OVERLAY
============================================================ */

function showCallingOverlay(
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


    if (homeScreen) {

        homeScreen.style.display =
            "none";

    }


    if (callScreen) {

        callScreen.classList.remove(
            "active"
        );

    }

}


/* ============================================================
   HIDE CALLING OVERLAY
============================================================ */

function hideCallingOverlay() {

    if (callingOverlay) {

        callingOverlay.style.display =
            "none";

    }

}


/* ============================================================
   CALL STATUS POLLING
============================================================ */

function startCallStatusPolling() {

    stopCallStatusPolling();


    checkOutgoingCallStatus();


    callStatusTimer =
        setInterval(
            checkOutgoingCallStatus,
            CALL_POLL_INTERVAL
        );

}


/* ============================================================
   STOP CALL STATUS POLLING
============================================================ */

function stopCallStatusPolling() {

    if (
        callStatusTimer
    ) {

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

    if (
        !currentCallId ||
        currentCallRole !==
        "caller"
    ) {

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
            data.call;


        if (!call) {

            return;

        }


        /* ==================================================
           ACCEPTED
        ================================================== */

        if (
            call.status ===
            "accepted"
        ) {

            stopCallStatusPolling();


            hideCallingOverlay();


            await startJaaSCall(
                currentName,
                currentRoom
            );


            return;

        }


        /* ==================================================
           DECLINED
        ================================================== */

        if (
            call.status ===
            "declined"
        ) {

            stopCallStatusPolling();


            hideCallingOverlay();


            alert(
                "The call was declined."
            );


            resetCallState();


            return;

        }


        /* ==================================================
           CANCELLED
        ================================================== */

        if (
            call.status ===
            "cancelled"
        ) {

            stopCallStatusPolling();


            hideCallingOverlay();


            resetCallState();


            return;

        }

    } catch (error) {

        console.warn(
            "Call status error:",
            error
        );

    }

}


/* ============================================================
   CANCEL OUTGOING CALL
============================================================ */

async function cancelOutgoingCall() {

    if (
        !currentCallId
    ) {

        hideCallingOverlay();

        resetCallState();

        return;

    }


    if (cancelCallButton) {

        cancelCallButton.disabled =
            true;

        cancelCallButton.textContent =
            "Cancelling...";

    }


    try {

        await apiRequest(
            "/call/cancel",
            {

                callId:
                    currentCallId,

                userId:
                    myUserId

            }
        );

    } catch (error) {

        console.warn(
            "Cancel call error:",
            error
        );

    }


    stopCallStatusPolling();


    hideCallingOverlay();


    resetCallState();


    if (cancelCallButton) {

        cancelCallButton.disabled =
            false;

        cancelCallButton.textContent =
            "Cancel";

    }

}


/* ============================================================
   START JaaS CALL
============================================================ */

async function startJaaSCall(
    name,
    room
) {

    if (startingJaaS) {

        return;

    }


    if (!room) {

        throw new Error(
            "Video room is missing."
        );

    }


    startingJaaS =
        true;


    if (joinButton) {

        joinButton.disabled =
            true;

    }


    if (createButton) {

        createButton.disabled =
            true;

    }


    try {

        currentName =
            name;


        currentRoom =
            room;


        saveMyName(
            name
        );


        /*
         * Get JaaS JWT.
         */

        const data =
            await apiRequest(
                "/token",
                {

                    name:
                        name,

                    room:
                        room

                }
            );


        if (
            !data.token ||
            !data.appId
        ) {

            throw new Error(
                "Could not create JaaS token."
            );

        }


        /*
         * Load JaaS API.
         */

        await loadJaaSApi(
            data.appId
        );


        /*
         * Show call screen.
         */

        hideCallingOverlay();


        if (homeScreen) {

            homeScreen.style.display =
                "none";

        }


        if (callScreen) {

            callScreen.classList.add(
                "active"
            );

        }


        if (roomLabel) {

            roomLabel.textContent =
                room;

        }


        /*
         * Clean previous JaaS instance.
         */

        if (jitsiApi) {

            try {

                jitsiApi.dispose();

            } catch (_) {}


            jitsiApi =
                null;

        }


        if (meet) {

            meet.innerHTML =
                "";

        }


        leavingCall =
            false;


        /*
         * Create JaaS.
         */

        jitsiApi =
            new JitsiMeetExternalAPI(
                "8x8.vc",
                {

                    roomName:
                        data.appId +
                        "/" +
                        room,

                    jwt:
                        data.token,

                    parentNode:
                        meet,

                    width:
                        "100%",

                    height:
                        "100%",

                    userInfo: {

                        displayName:
                            name

                    },

                    configOverwrite: {

                        prejoinPageEnabled:
                            true,

                        startWithAudioMuted:
                            false,

                        startWithVideoMuted:
                            false,

                        disableDeepLinking:
                            true,

                        disableAP:
                            true

                    },

                    interfaceConfigOverwrite: {

                        MOBILE_APP_PROMO:
                            false,

                        SHOW_JITSI_WATERMARK:
                            false,

                        SHOW_WATERMARK_FOR_GUESTS:
                            false

                    }

                }
            );


        /*
         * Meeting left.
         */

        jitsiApi.addEventListener(
            "videoConferenceLeft",
            () => {

                if (
                    !leavingCall
                ) {

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
            "Unable to start video call."
        );


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


        startingJaaS =
            false;

    }

}


/* ============================================================
   JOIN ROOM
============================================================ */

if (joinButton) {

    joinButton.addEventListener(
        "click",
        async () => {

            const name =
                nameInput.value.trim();


            const room =
                cleanRoom(
                    roomInput.value
                );


            if (!name) {

                alert(
                    "Please enter your name."
                );


                nameInput.focus();


                return;

            }


            if (!room) {

                alert(
                    "Please enter a room code."
                );


                roomInput.focus();


                return;

            }


            saveMyName(
                name
            );


            currentCallId =
                "";

            currentCallRole =
                "";

            currentReceiverId =
                "";

            currentReceiverName =
                "";


            await updateMyPresence();


            await startJaaSCall(
                name,
                room
            );

        }
    );

}


/* ============================================================
   CREATE ROOM
============================================================ */

if (createButton) {

    createButton.addEventListener(
        "click",
        async () => {

            const name =
                nameInput.value.trim();


            if (!name) {

                alert(
                    "Please enter your name."
                );


                nameInput.focus();


                return;

            }


            saveMyName(
                name
            );


            currentCallId =
                "";

            currentCallRole =
                "";

            currentReceiverId =
                "";

            currentReceiverName =
                "";


            await updateMyPresence();


            const room =
                generateRoom();


            roomInput.value =
                room;


            await startJaaSCall(
                name,
                room
            );

        }
    );

}


/* ============================================================
   NAME INPUT
============================================================ */

if (nameInput) {

    nameInput.addEventListener(
        "input",
        () => {

            const name =
                nameInput.value.trim();


            currentName =
                name;


            if (name) {

                saveMyName(
                    name
                );

            }

        }
    );


    nameInput.addEventListener(
        "change",
        async () => {

            await updateMyPresence();

            await loadOnlineUsers();

        }
    );


    nameInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();


                if (
                    roomInput &&
                    roomInput.value.trim()
                ) {

                    joinButton.click();

                } else {

                    loadOnlineUsers();

                }

            }

        }
    );

}


/* ============================================================
   ROOM ENTER KEY
============================================================ */

if (roomInput) {

    roomInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                joinButton.click();

            }

        }
    );

}


/* ============================================================
   REFRESH ONLINE USERS
============================================================ */

if (refreshUsersButton) {

    refreshUsersButton.addEventListener(
        "click",
        async () => {

            refreshUsersButton.disabled =
                true;


            try {

                await updateMyPresence();

                await loadOnlineUsers();

            } finally {

                refreshUsersButton.disabled =
                    false;

            }

        }
    );

}


/* ============================================================
   CALL USER
============================================================ */

/*
 * IMPORTANT:
 *
 * This is now called internally from the
 * Online Users list.
 *
 * The user does NOT type the receiver ID.
 */

async function callUser(
    receiverId,
    receiverName
) {

    const callerName =
        nameInput.value.trim();


    if (!callerName) {

        alert(
            "Please enter your name first."
        );


        nameInput.focus();


        return;

    }


    if (!receiverId) {

        alert(
            "This user is no longer online."
        );


        await loadOnlineUsers();


        return;

    }


    if (
        receiverId ===
        myUserId
    ) {

        return;

    }


    if (
        currentCallId
    ) {

        alert(
            "You already have an active call."
        );


        return;

    }


    saveMyName(
        callerName
    );


    currentName =
        callerName;


    await updateMyPresence();


    try {

        await createOutgoingCall(
            receiverId,
            receiverName ||
                "User",
            callerName
        );


    } catch (error) {

        console.error(
            "Create call error:",
            error
        );


        alert(
            error.message ||
            "Could not start the call."
        );


        hideCallingOverlay();


        resetCallState();


        await loadOnlineUsers();

    }

}


/*
 * Expose internally if needed.
 *
 * No UI input uses this.
 */

window.callUser =
    callUser;


/* ============================================================
   GET MY USER ID
============================================================ */

/*
 * Kept internally for debugging/future use.
 *
 * User ID is NOT displayed in the UI.
 */

window.getMyUserId =
    function () {

        return myUserId;

    };


/* ============================================================
   REFRESH ONLINE USERS API
============================================================ */

window.refreshOnlineUsers =
    function () {

        return loadOnlineUsers();

    };


/* ============================================================
   UPDATE PRESENCE API
============================================================ */

window.updateMyPresence =
    function () {

        return updateMyPresence();

    };


/* ============================================================
   LEAVE CALL
============================================================ */

async function leaveCall() {

    if (leavingCall) {

        return;

    }


    leavingCall =
        true;


    stopCallStatusPolling();


    hideCallingOverlay();


    hideIncomingCall();


    /*
     * If this was an active
     * signaling call, tell server.
     *
     * Only cancel if caller is
     * still in ringing state.
     */

    if (
        currentCallId &&
        currentCallRole ===
        "caller"
    ) {

        try {

            await apiRequest(
                "/call/cancel",
                {

                    callId:
                        currentCallId,

                    userId:
                        myUserId

                }
            );

        } catch (_) {}

    }


    /*
     * Dispose JaaS.
     */

    if (jitsiApi) {

        try {

            jitsiApi.dispose();

        } catch (_) {}


        jitsiApi =
            null;

    }


    if (meet) {

        meet.innerHTML =
            "";

    }


    if (callScreen) {

        callScreen.classList.remove(
            "active"
        );

    }


    if (homeScreen) {

        homeScreen.style.display =
            "flex";

    }


    currentRoom =
        "";

    currentCallId =
        "";

    currentCallRole =
        "";

    currentReceiverId =
        "";

    currentReceiverName =
        "";


    currentName =
        nameInput.value.trim();


    /*
     * Refresh online users after call.
     */

    await loadOnlineUsers();


    leavingCall =
        false;

}


/* ============================================================
   RESET CALL STATE
============================================================ */

function resetCallState() {

    stopCallStatusPolling();


    hideCallingOverlay();


    hideIncomingCall();


    if (jitsiApi) {

        try {

            jitsiApi.dispose();

        } catch (_) {}


        jitsiApi =
            null;

    }


    if (meet) {

        meet.innerHTML =
            "";

    }


    if (callScreen) {

        callScreen.classList.remove(
            "active"
        );

    }


    if (homeScreen) {

        homeScreen.style.display =
            "flex";

    }


    currentRoom =
        "";

    currentCallId =
        "";

    currentCallRole =
        "";

    currentReceiverId =
        "";

    currentReceiverName =
        "";


    currentName =
        nameInput.value.trim();


    loadOnlineUsers();

}


/* ============================================================
   BACK BUTTON
============================================================ */

if (backButton) {

    backButton.addEventListener(
        "click",
        async () => {

            if (
                currentCallId &&
                currentCallRole ===
                "caller"
            ) {

                if (
                    confirm(
                        "Cancel this call?"
                    )
                ) {

                    await cancelOutgoingCall();

                }


                return;

            }


            if (
                confirm(
                    "Leave this video call?"
                )
            ) {

                await leaveCall();

            }

        }
    );

}


/* ============================================================
   CANCEL BUTTON
============================================================ */

if (cancelCallButton) {

    cancelCallButton.addEventListener(
        "click",
        async () => {

            await cancelOutgoingCall();

        }
    );

}


/* ============================================================
   ACCEPT BUTTON
============================================================ */

if (acceptCallButton) {

    acceptCallButton.addEventListener(
        "click",
        acceptIncomingCall
    );

}


/* ============================================================
   DECLINE BUTTON
============================================================ */

if (declineCallButton) {

    declineCallButton.addEventListener(
        "click",
        declineIncomingCall
    );

}


/* ============================================================
   COPY ROOM
============================================================ */

if (copyButton) {

    copyButton.addEventListener(
        "click",
        async () => {

            if (
                !currentRoom
            ) {

                return;

            }


            try {

                await navigator.clipboard.writeText(
                    currentRoom
                );


                const old =
                    copyButton.textContent;


                copyButton.textContent =
                    "Copied!";


                setTimeout(
                    () => {

                        copyButton.textContent =
                            old;

                    },
                    1500
                );


            } catch (_) {

                prompt(
                    "Copy this room code:",
                    currentRoom
                );

            }

        }
    );

}


/* ============================================================
   VISIBILITY CHANGE
============================================================ */

document.addEventListener(
    "visibilitychange",
    async () => {

        /*
         * When user comes back to the page,
         * immediately refresh presence/users.
         */

        if (
            !document.hidden
        ) {

            await updateMyPresence();

            await loadOnlineUsers();

            await pollIncomingCalls();

        }

    }
);


/* ============================================================
   BEFORE UNLOAD
============================================================ */

window.addEventListener(
    "beforeunload",
    () => {

        stopCallStatusPolling();

        stopPresenceHeartbeat();


        if (
            incomingCallTimer
        ) {

            clearInterval(
                incomingCallTimer
            );

            incomingCallTimer =
                null;

        }


        if (
            onlineUsersTimer
        ) {

            clearInterval(
                onlineUsersTimer
            );

            onlineUsersTimer =
                null;

        }

    }
);


/* ============================================================
   START APP
============================================================ */

async function startApp() {

    /*
     * Existing saved name.
     */

    const name =
        nameInput.value.trim();


    if (name) {

        currentName =
            name;


        saveMyName(
            name
        );

    }


    /*
     * Register presence.
     */

    startPresenceHeartbeat();


    /*
     * Load online users.
     */

    startOnlineUsersPolling();


    /*
     * Incoming calls.
     */

    startIncomingCallPolling();

}


startApp();
