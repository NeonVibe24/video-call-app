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
INCOMING CALL UI
============================================================ */

const incomingCallOverlay =
document.getElementById(
"incomingCallOverlay"
);

const incomingCallerName =
document.getElementById(
"incomingCallerName"
);

const declineCallButton =
document.getElementById(
"declineCallButton"
);

const acceptCallButton =
document.getElementById(
"acceptCallButton"
);

/* ============================================================
OUTGOING CALL UI
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
API
============================================================ */

const API = "/api";

/* ============================================================
JAAS
============================================================ */

const JAAS_DOMAIN =
"8x8.vc";

let jitsiApi = null;

/* ============================================================
USER STATE
============================================================ */

let currentName = "";

let currentCallId = "";

let currentCallRole = "";

let currentRoom = "";

let currentReceiverId = "";

let currentReceiverName = "";

/* ============================================================
CALL STATE
============================================================ */

let incomingCall = null;

let incomingCallVisible = false;

let callStatusTimer = null;

let incomingCallTimer = null;

/* ============================================================
PRESENCE STATE
============================================================ */

let presenceTimer = null;

let onlineUsersTimer = null;

let presenceBusy = false;

let usersPollBusy = false;

let nameUpdateTimer = null;

/* ============================================================
JITSI STATE
============================================================ */

let leavingJitsi = false;

/* ============================================================
INTERNAL USER ID
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
NAME STORAGE
============================================================ */

function saveMyName(name) {

const value =
    String(name || "").trim();


try {

    localStorage.setItem(
        "video_call_name",
        value
    );

} catch (_) {}

}

function loadMyName() {

try {

    const saved =
        localStorage.getItem(
            "video_call_name"
        ) || "";


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
NAME
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
            "application/json",

        "Accept":
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

    return false;
}


saveMyName(name);


if (presenceBusy) {

    return true;
}


presenceBusy =
    true;


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


    if (
        data &&
        data.ok
    ) {

        setConnectionStatus(
            "Online"
        );

    } else {

        setConnectionStatus(
            "Reconnecting..."
        );
    }


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

    presenceBusy =
        false;
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


if (usersPollBusy) {

    return;
}


usersPollBusy =
    true;


try {

    const data =
        await apiRequest(
            "/presence/poll",
            {
                userId:
                    myUserId
            }
        );


    let users =
        Array.isArray(
            data.users
        )
            ? data.users
            : [];


    users =
        users.filter(
            user => {

                if (!user) {

                    return false;
                }


                return String(
                    user.userId || ""
                ) !== myUserId;
            }
        );


    renderOnlineUsers(
        users
    );

} catch (error) {

    console.error(
        "Online users error:",
        error
    );

} finally {

    usersPollBusy =
        false;
}

}

/* ============================================================
RENDER ONLINE USERS
============================================================ */

function renderOnlineUsers(users) {

if (!onlineUsers) {

    return;
}


onlineUsers.innerHTML =
    "";


const list =
    Array.isArray(users)
        ? users.filter(
            user =>
                user &&
                user.userId &&
                String(
                    user.userId
                ) !== myUserId
          )
        : [];


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
            );


        const userName =
            String(
                user.name ||
                "User"
            );


        const isBusy =
            String(
                user.status ||
                "online"
            ).toLowerCase() ===
            "busy";


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
                userName
            );


        const details =
            document.createElement(
                "div"
            );


        const userNameElement =
            document.createElement(
                "div"
            );


        userNameElement.className =
            "online-user-name";


        userNameElement.textContent =
            userName;


        const status =
            document.createElement(
                "div"
            );


        status.className =
            "online-user-status";


        if (isBusy) {

            status.classList.add(
                "busy"
            );
        }


        const dot =
            document.createElement(
                "span"
            );


        dot.className =
            "online-status-dot";


        if (isBusy) {

            dot.classList.add(
                "busy"
            );
        }


        const statusText =
            document.createElement(
                "span"
            );


        statusText.textContent =
            isBusy
                ? "Busy"
                : "Online";


        status.appendChild(
            dot
        );

        status.appendChild(
            statusText
        );


        details.appendChild(
            userNameElement
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


        callButton.dataset.userId =
            userId;


        callButton.dataset.userName =
            userName;


        callButton.textContent =
            isBusy
                ? "Busy"
                : "Call";


        /*
         * Busy users are still clickable.
         * Backend will decide if call is allowed.
         */

        callButton.disabled =
            false;


        if (isBusy) {

            callButton.classList.add(
                "busy"
            );
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


        console.log(
            "CALL BUTTON CLICKED"
        );


        console.log(
            "Receiver ID:",
            receiverId
        );


        console.log(
            "Receiver Name:",
            receiverName
        );


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
REFRESH
============================================================ */

async function refreshOnlineUsers() {

await registerPresence();

await pollOnlineUsers();

}

window.refreshOnlineUsers =
refreshOnlineUsers;

if (refreshUsersButton) {

refreshUsersButton.addEventListener(
    "click",
    async event => {

        event.preventDefault();


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
UPDATE PRESENCE
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
                updateMyPresence,
                500
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


registerPresence()
    .then(
        pollOnlineUsers
    )
    .catch(
        error =>
            console.error(
                "Initial presence error:",
                error
            )
    );


/*
 * Worker timeout = 30 seconds.
 * Heartbeat = 8 seconds.
 */

presenceTimer =
    setInterval(
        registerPresence,
        8000
    );


/*
 * Refresh users every 2.5 seconds.
 */

onlineUsersTimer =
    setInterval(
        pollOnlineUsers,
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
                item.receiverId ===
                    myUserId &&
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
START INCOMING POLLING
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
ACCEPT CALL
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


    hideIncomingCall();


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


    resetCallState();


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

if (acceptCallButton) {

acceptCallButton.addEventListener(
    "click",
    acceptIncomingCall
);

}

/* ============================================================
DECLINE CALL
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
        receiverName || "User"
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


try {

    setConnectionStatus(
        "Calling..."
    );


    /*
     * IMPORTANT:
     *
     * The user does NOT create or enter a room.
     *
     * Worker creates the private call room.
     */

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
                    receiverName
            }
        );


    const createdCall =
        data.call ||
        data;


    currentCallId =
        String(
            createdCall.callId ||
            data.callId ||
            ""
        );


    currentCallRole =
        "caller";


    currentRoom =
        String(
            createdCall.room ||
            data.room ||
            ""
        );


    if (!currentCallId) {

        throw new Error(
            "Server did not return a Call ID."
        );
    }


    if (!currentRoom) {

        throw new Error(
            "Server did not create a private call room."
        );
    }


    console.log(
        "CALL CREATED:",
        createdCall
    );


    showCallingScreen(
        receiverName
    );


    startOutgoingCallStatusPolling();


    await pollOnlineUsers();

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
CALLING UI
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
OUTGOING CALL STATUS
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

/* ============================================================
CHECK CALL STATUS
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


    await pollOnlineUsers();
}

}

/* ============================================================
LOAD JAAS API
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
START JAAS
============================================================ */

async function startJaaSCall(
displayName,
room
) {

if (!room) {

    throw new Error(
        "Private call room is missing."
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

        /*
         * Do not show the actual room code.
         */

        roomLabel.textContent =
            "Private Video Call";
    }


    if (meet) {

        meet.innerHTML =
            "";
    }


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


    alert(
        error.message ||
        "Unable to start video call."
    );
}

}

/* ============================================================
LEAVE CALL
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
DISPOSE JAAS
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
INITIALIZE
============================================================ */

loadMyName();

startPresence();

startIncomingCallPolling();

/* ============================================================
DEBUG HELPERS
============================================================ */

window.getMyUserId =
function () {

    return myUserId;
};

window.getMyName =
function () {

    return getMyName();
};

window.testPresence =
async function () {

    console.log(
        "MY USER ID:",
        myUserId
    );


    console.log(
        "MY NAME:",
        getMyName()
    );


    await registerPresence();

    await pollOnlineUsers();


    console.log(
        "Presence test complete."
    );
};

console.log(
"Private 1v1 Video Call initialized."
);

console.log(
"My User ID:",
myUserId
);

console.log(
"My Name:",
getMyName()
);
