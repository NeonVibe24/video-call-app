"use strict";

/* ============================================================
   VIDEO CALL APP
============================================================ */

const API = "/api";
const JAAS_DOMAIN = "8x8.vc";
const JAAS_APP_ID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5";


/* ============================================================
   DOM
============================================================ */

const homeScreen = document.getElementById("homeScreen");
const callScreen = document.getElementById("callScreen");

const nameInput = document.getElementById("nameInput");

const backButton = document.getElementById("backButton");
const roomLabel = document.getElementById("roomLabel");
const meet = document.getElementById("meet");

const onlineUsers = document.getElementById("onlineUsers");
const onlineCount = document.getElementById("onlineCount");
const refreshUsersButton =
    document.getElementById("refreshUsersButton");

const noUsersMessage = document.getElementById("noUsersMessage");
const connectionStatus =
    document.getElementById("connectionStatus");


/* ============================================================
   INCOMING CALL
============================================================ */

const incomingOverlay =
    document.getElementById("incomingCallOverlay");

const incomingCallerName =
    document.getElementById("incomingCallerName");

const acceptCallButton =
    document.getElementById("acceptCallButton");

const declineCallButton =
    document.getElementById("declineCallButton");


/* ============================================================
   OUTGOING CALL
============================================================ */

const outgoingOverlay =
    document.getElementById("outgoingCallOverlay");

const outgoingReceiverName =
    document.getElementById("outgoingReceiverName");

const cancelCallButton =
    document.getElementById("cancelCallButton");


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
let usersTimer = null;

let presenceBusy = false;
let usersBusy = false;

let leavingJitsi = false;

let nameTimer = null;

let jitsiApi = null;


/* ============================================================
   USER ID
   IMPORTANT:
   Each browser/tab gets a different ID.
============================================================ */

function createUserId() {

    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {
        return window.crypto.randomUUID();
    }

    return (
        "u-" +
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 14)
    );
}


function getUserId() {

    try {

        let id =
            sessionStorage.getItem(
                "video_call_user_id"
            );

        if (!id) {

            id = createUserId();

            sessionStorage.setItem(
                "video_call_user_id",
                id
            );
        }

        return id;

    } catch (error) {

        return createUserId();
    }
}


const myUserId = getUserId();


/* ============================================================
   NAME
============================================================ */

function loadMyName() {

    let name = "";

    try {

        name =
            localStorage.getItem(
                "video_call_name"
            ) || "";

    } catch (error) {

        name = "";
    }

    currentName =
        String(name).trim();

    if (nameInput) {
        nameInput.value =
            currentName;
    }

    return currentName;
}


function getMyName() {

    if (
        nameInput &&
        nameInput.value.trim()
    ) {
        return nameInput.value.trim();
    }

    try {

        return (
            localStorage.getItem(
                "video_call_name"
            ) || ""
        ).trim();

    } catch (error) {

        return currentName || "";
    }
}


function saveMyName(name) {

    name =
        String(name || "").trim();

    currentName =
        name;

    try {

        if (name) {

            localStorage.setItem(
                "video_call_name",
                name
            );

        } else {

            localStorage.removeItem(
                "video_call_name"
            );
        }

    } catch (error) {
        /* ignore */
    }
}


function getInitial(name) {

    name =
        String(name || "").trim();

    if (!name) {
        return "?";
    }

    return name
        .charAt(0)
        .toUpperCase();
}


/* ============================================================
   STATUS
============================================================ */

function setConnectionStatus(
    text,
    type
) {

    if (!connectionStatus) {
        return;
    }

    connectionStatus.textContent =
        text || "";

    connectionStatus.classList.remove(
        "online",
        "offline",
        "busy",
        "error"
    );

    if (type) {
        connectionStatus.classList.add(type);
    }
}


/* ============================================================
   API
============================================================ */

async function apiRequest(
    path,
    body = {},
    method = "POST"
) {

    const options = {

        method: method,

        headers: {

            "Content-Type":
                "application/json",

            "Accept":
                "application/json",

            "Cache-Control":
                "no-cache"
        },

        cache:
            "no-store"
    };


    if (
        method !== "GET" &&
        method !== "HEAD"
    ) {

        options.body =
            JSON.stringify(body);
    }


    const response =
        await fetch(
            API + path,
            options
        );


    let data = {};

    try {

        data =
            await response.json();

    } catch (error) {

        data = {};
    }


    if (!response.ok) {

        throw new Error(
            data.error ||
            data.message ||
            "HTTP " + response.status
        );
    }


    return data;
}


/* ============================================================
   ROOM
============================================================ */

function generatePrivateRoom() {

    return (
        "call-" +
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 12)
    );
}


/* ============================================================
   EMPTY USERS
============================================================ */

function showNoUsers() {

    if (!onlineUsers) {
        return;
    }

    onlineUsers.innerHTML = "";

    if (onlineCount) {
        onlineCount.textContent = "0";
    }


    if (noUsersMessage) {

        noUsersMessage.style.display =
            "";

        onlineUsers.appendChild(
            noUsersMessage
        );

    } else {

        const empty =
            document.createElement("div");

        empty.className =
            "no-users";

        empty.innerHTML =
            "<div class='no-users-icon'>👥</div>" +
            "<div>No other users online</div>" +
            "<small>Online users will appear here.</small>";

        onlineUsers.appendChild(
            empty
        );
    }
}


/* ============================================================
   REGISTER ONLINE
============================================================ */

async function registerPresence() {

    if (presenceBusy) {
        return false;
    }


    const name =
        getMyName();


    if (!name) {

        setConnectionStatus(
            "Enter your name",
            "offline"
        );

        return false;
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


        if (
            data &&
            data.ok
        ) {

            currentName =
                name;

            setConnectionStatus(
                "Online",
                "online"
            );

            return true;
        }


        return false;


    } catch (error) {

        console.error(
            "Presence online:",
            error
        );

        setConnectionStatus(
            "Connection error",
            "error"
        );

        return false;


    } finally {

        presenceBusy =
            false;
    }
}


/* ============================================================
   NORMALIZE USER
============================================================ */

function normalizeUser(user) {

    if (!user) {
        return null;
    }


    const userId =
        String(
            user.userId ||
            user.id ||
            ""
        ).trim();


    const name =
        String(
            user.name ||
            user.username ||
            ""
        ).trim();


    let status =
        String(
            user.status ||
            "online"
        ).trim()
        .toLowerCase();


    if (!userId || !name) {
        return null;
    }


    if (
        status !== "busy" &&
        status !== "online"
    ) {

        status =
            "online";
    }


    return {

        userId:
            userId,

        name:
            name,

        status:
            status
    };
}


/* ============================================================
   POLL ONLINE USERS
============================================================ */

async function pollOnlineUsers() {

    if (usersBusy) {
        return;
    }


    const name =
        getMyName();


    if (!name) {

        showNoUsers();

        return;
    }


    usersBusy = true;


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


        if (
            !data ||
            !Array.isArray(data.users)
        ) {

            showNoUsers();

            return;
        }


        const users = [];


        data.users.forEach(
            function (rawUser) {

                const user =
                    normalizeUser(
                        rawUser
                    );


                if (!user) {
                    return;
                }


                /*
                 IMPORTANT:
                 Never show ourselves.
                */

                if (
                    user.userId ===
                    myUserId
                ) {
                    return;
                }


                users.push(
                    user
                );
            }
        );


        renderOnlineUsers(
            users
        );


        setConnectionStatus(
            "Online",
            "online"
        );


    } catch (error) {

        console.error(
            "Presence poll error:",
            error
        );

        /*
         Don't erase the current list
         on a temporary network failure.
        */

    } finally {

        usersBusy =
            false;
    }
}


/* ============================================================
   RENDER USERS
============================================================ */

function renderOnlineUsers(
    users
) {

    if (!onlineUsers) {
        return;
    }


    onlineUsers.innerHTML = "";


    if (!Array.isArray(users)) {
        users = [];
    }


    if (onlineCount) {

        onlineCount.textContent =
            String(users.length);
    }


    if (users.length === 0) {

        showNoUsers();

        return;
    }


    users.forEach(
        function (user) {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "online-user-item";


            item.dataset.userId =
                user.userId;

            item.dataset.userName =
                user.name;


            /* INFO */

            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "online-user-info";


            /* AVATAR */

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


            /* TEXT */

            const text =
                document.createElement(
                    "div"
                );

            text.className =
                "online-user-text";


            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "online-user-name";

            name.textContent =
                user.name;


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


            if (
                user.status ===
                "busy"
            ) {

                status.classList.add(
                    "busy"
                );

                dot.classList.add(
                    "busy"
                );

                status.appendChild(
                    dot
                );

                status.appendChild(
                    document.createTextNode(
                        " Busy"
                    )
                );

            } else {

                status.appendChild(
                    dot
                );

                status.appendChild(
                    document.createTextNode(
                        " Online"
                    )
                );
            }


            text.appendChild(
                name
            );

            text.appendChild(
                status
            );


            info.appendChild(
                avatar
            );

            info.appendChild(
                text
            );


            /* CALL BUTTON */

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "online-call-button";


            button.dataset.userId =
                user.userId;

            button.dataset.userName =
                user.name;


            if (
                user.status ===
                "busy"
            ) {

                button.classList.add(
                    "busy"
                );

                button.disabled =
                    true;

                button.textContent =
                    "Busy";

            } else {

                button.disabled =
                    false;

                button.textContent =
                    "Call";
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
   REFRESH
============================================================ */

async function refreshOnlineUsers() {

    if (!getMyName()) {

        showNoUsers();

        setConnectionStatus(
            "Enter your name",
            "offline"
        );

        return;
    }


    /*
     Always register first.
    */

    await registerPresence();


    /*
     Then immediately ask the server
     for all other users.
    */

    await pollOnlineUsers();
}


/* ============================================================
   CALL BUTTON EVENT
============================================================ */

if (onlineUsers) {

    onlineUsers.addEventListener(
        "click",
        async function (event) {

            const button =
                event.target.closest(
                    ".online-call-button"
                );


            if (!button) {
                return;
            }


            event.preventDefault();
            event.stopPropagation();


            if (button.disabled) {
                return;
            }


            const receiverId =
                String(
                    button.dataset.userId ||
                    ""
                ).trim();


            const receiverName =
                String(
                    button.dataset.userName ||
                    ""
                ).trim();


            if (
                !receiverId ||
                !receiverName
            ) {
                return;
            }


            if (
                receiverId ===
                myUserId
            ) {
                return;
            }


            await callUser(
                receiverId,
                receiverName
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
        function () {

            currentName =
                nameInput.value.trim();


            if (nameTimer) {

                clearTimeout(
                    nameTimer
                );
            }


            nameTimer =
                setTimeout(
                    async function () {

                        const name =
                            getMyName();


                        if (!name) {

                            try {

                                localStorage.removeItem(
                                    "video_call_name"
                                );

                            } catch (error) {}


                            showNoUsers();

                            setConnectionStatus(
                                "Enter your name",
                                "offline"
                            );

                            return;
                        }


                        saveMyName(
                            name
                        );


                        await registerPresence();

                        await pollOnlineUsers();

                    },
                    400
                );
        }
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


    if (usersTimer) {

        clearInterval(
            usersTimer
        );

        usersTimer =
            null;
    }


    loadMyName();


    if (!getMyName()) {

        showNoUsers();

        setConnectionStatus(
            "Enter your name",
            "offline"
        );

        return;
    }


    await refreshOnlineUsers();


    /*
     HEARTBEAT
     Every 8 seconds.
    */

    presenceTimer =
        setInterval(
            async function () {

                if (
                    leavingJitsi ||
                    presenceBusy
                ) {
                    return;
                }


                if (!getMyName()) {
                    return;
                }


                await registerPresence();

            },
            8000
        );


    /*
     USER LIST
     Every 2 seconds.
    */

    usersTimer =
        setInterval(
            async function () {

                if (
                    leavingJitsi ||
                    usersBusy
                ) {
                    return;
                }


                if (!getMyName()) {
                    return;
                }


                await pollOnlineUsers();

            },
            2000
        );
}


/* ============================================================
   OFFLINE
============================================================ */

function setOffline() {

    const body =
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
                    [body],
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

    } catch (error) {}


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
                    body,

                keepalive:
                    true
            }
        ).catch(
            function () {}
        );

    } catch (error) {}
}


window.addEventListener(
    "pagehide",
    setOffline
);


/* ============================================================
   REFRESH BUTTON
============================================================ */

if (refreshUsersButton) {

    refreshUsersButton.addEventListener(
        "click",
        async function () {

            refreshUsersButton.disabled =
                true;


            try {

                await refreshOnlineUsers();

            } finally {

                setTimeout(
                    function () {

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
   CALL USER
============================================================ */

async function callUser(
    receiverId,
    receiverName
) {

    if (
        !receiverId ||
        !receiverName
    ) {
        return;
    }


    if (
        receiverId ===
        myUserId
    ) {
        return;
    }


    if (currentCallId) {
        return;
    }


    const name =
        getMyName();


    if (!name) {

        alert(
            "Please enter your name first."
        );

        return;
    }


    currentName =
        name;

    currentReceiverId =
        receiverId;

    currentReceiverName =
        receiverName;

    currentCallRole =
        "caller";

    currentRoom =
        generatePrivateRoom();


    showOutgoingCall(
        receiverName
    );


    try {

        const data =
            await apiRequest(
                "/call",
                {
                    callerId:
                        myUserId,

                    callerName:
                        name,

                    receiverId:
                        receiverId,

                    receiverName:
                        receiverName,

                    room:
                        currentRoom
                }
            );


        if (
            !data ||
            !data.ok ||
            !data.call
        ) {

            throw new Error(
                data &&
                (
                    data.error ||
                    data.message
                )
                    ? (
                        data.error ||
                        data.message
                    )
                    : "Call failed"
            );
        }


        currentCallId =
            data.call.callId;


        startCallStatusPolling();


    } catch (error) {

        console.error(
            "Call error:",
            error
        );


        hideOutgoingCall();

        resetCallState();


        alert(
            error.message ||
            "Unable to start call."
        );
    }
}


/* ============================================================
   OUTGOING UI
============================================================ */

function showOutgoingCall(
    name
) {

    if (outgoingReceiverName) {

        outgoingReceiverName.textContent =
            name || "";
    }


    if (outgoingOverlay) {

        outgoingOverlay.classList.add(
            "show"
        );

        outgoingOverlay.style.display =
            "";
    }
}


function hideOutgoingCall() {

    if (!outgoingOverlay) {
        return;
    }


    outgoingOverlay.classList.remove(
        "show"
    );


    outgoingOverlay.style.display =
        "none";
}


/* ============================================================
   INCOMING UI
============================================================ */

function showIncomingCall(
    call
) {

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
            "Unknown";
    }


    if (incomingOverlay) {

        incomingOverlay.classList.add(
            "show"
        );

        incomingOverlay.style.display =
            "";
    }
}


function hideIncomingCall() {

    incomingCallVisible =
        false;

    incomingCall =
        null;


    if (!incomingOverlay) {
        return;
    }


    incomingOverlay.classList.remove(
        "show"
    );


    incomingOverlay.style.display =
        "none";
}


/* ============================================================
   INCOMING CALL POLL
============================================================ */

async function pollIncomingCalls() {

    if (currentCallId) {
        return;
    }


    if (incomingCallVisible) {
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
            !data ||
            !Array.isArray(
                data.calls
            )
        ) {
            return;
        }


        if (
            data.calls.length ===
            0
        ) {
            return;
        }


        const call =
            data.calls[0];


        if (
            !call ||
            !call.callId
        ) {
            return;
        }


        currentCallId =
            call.callId;

        currentRoom =
            call.room || "";

        currentCallRole =
            "receiver";

        currentReceiverId =
            call.callerId || "";

        currentReceiverName =
            call.callerName || "";


        showIncomingCall(
            call
        );


    } catch (error) {

        console.error(
            "Incoming call:",
            error
        );
    }
}


/* ============================================================
   INCOMING TIMER
============================================================ */

incomingCallTimer =
    setInterval(
        async function () {

            await pollIncomingCalls();

        },
        1200
    );


/* ============================================================
   ACCEPT
============================================================ */

if (acceptCallButton) {

    acceptCallButton.addEventListener(
        "click",
        async function () {

            if (!incomingCall) {
                return;
            }


            const call =
                incomingCall;


            acceptCallButton.disabled =
                true;


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


                if (
                    !data ||
                    !data.ok
                ) {

                    throw new Error(
                        data &&
                        (
                            data.error ||
                            data.message
                        )
                            ? (
                                data.error ||
                                data.message
                            )
                            : "Unable to accept call"
                    );
                }


                currentCallId =
                    call.callId;

                currentRoom =
                    call.room;

                currentCallRole =
                    "receiver";

                currentReceiverId =
                    call.callerId;

                currentReceiverName =
                    call.callerName;


                hideIncomingCall();


                await startJaaSCall();


            } catch (error) {

                console.error(
                    "Accept error:",
                    error
                );


                alert(
                    error.message ||
                    "Unable to accept call."
                );


                resetCallState();


            } finally {

                acceptCallButton.disabled =
                    false;
            }
        }
    );
}


/* ============================================================
   DECLINE
============================================================ */

if (declineCallButton) {

    declineCallButton.addEventListener(
        "click",
        async function () {

            if (!incomingCall) {
                return;
            }


            const call =
                incomingCall;


            declineCallButton.disabled =
                true;


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
                    "Decline:",
                    error
                );
            }


            hideIncomingCall();

            resetCallState();


            declineCallButton.disabled =
                false;
        }
    );
}


/* ============================================================
   CANCEL
============================================================ */

if (cancelCallButton) {

    cancelCallButton.addEventListener(
        "click",
        async function () {

            await cancelCurrentCall();

        }
    );
}


async function cancelCurrentCall() {

    const callId =
        currentCallId;


    hideOutgoingCall();


    if (!callId) {

        resetCallState();

        return;
    }


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
            "Cancel:",
            error
        );
    }


    resetCallState();
}


/* ============================================================
   CALL STATUS
============================================================ */

function startCallStatusPolling() {

    stopCallStatusPolling();


    callStatusTimer =
        setInterval(
            async function () {

                await pollCallStatus();

            },
            1200
        );
}


function stopCallStatusPolling() {

    if (callStatusTimer) {

        clearInterval(
            callStatusTimer
        );

        callStatusTimer =
            null;
    }
}


async function pollCallStatus() {

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


        if (!data) {
            return;
        }


        const status =
            String(
                data.status ||
                (
                    data.call &&
                    data.call.status
                ) ||
                ""
            ).toLowerCase();


        if (
            status ===
            "accepted"
        ) {

            if (
                currentCallRole ===
                "caller"
            ) {

                stopCallStatusPolling();

                hideOutgoingCall();

                await startJaaSCall();
            }

            return;
        }


        if (
            status ===
            "declined" ||
            status ===
            "cancelled" ||
            status ===
            "canceled" ||
            status ===
            "ended"
        ) {

            stopCallStatusPolling();

            hideOutgoingCall();

            hideIncomingCall();

            resetCallState();
        }


    } catch (error) {

        console.error(
            "Call status:",
            error
        );
    }
}


/* ============================================================
   JAAS TOKEN
============================================================ */

async function getJaasToken(
    room
) {

    const data =
        await apiRequest(
            "/token",
            {
                userId:
                    myUserId,

                name:
                    getMyName(),

                room:
                    room
            }
        );


    if (
        !data ||
        !data.token
    ) {

        throw new Error(
            "JaaS token not received."
        );
    }


    return data.token;
}


/* ============================================================
   JAAS SCRIPT
============================================================ */

function loadJaaSScript() {

    return new Promise(
        function (
            resolve,
            reject
        ) {

            if (
                window.JitsiMeetExternalAPI
            ) {

                resolve();

                return;
            }


            const oldScript =
                document.querySelector(
                    'script[data-jaas-external-api="1"]'
                );


            if (oldScript) {

                oldScript.addEventListener(
                    "load",
                    resolve,
                    {
                        once:
                            true
                    }
                );

                oldScript.addEventListener(
                    "error",
                    function () {

                        reject(
                            new Error(
                                "Unable to load JaaS."
                            )
                        );
                    },
                    {
                        once:
                            true
                    }
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
                JAAS_APP_ID +
                "/external_api.js";


            script.async =
                true;


            script.dataset.jaasExternalApi =
                "1";


            script.onload =
                function () {

                    resolve();
                };


            script.onerror =
                function () {

                    reject(
                        new Error(
                            "Unable to load JaaS."
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

async function startJaaSCall() {

    if (!currentRoom) {

        throw new Error(
            "Call room is missing."
        );
    }


    try {

        await loadJaaSScript();


        const token =
            await getJaasToken(
                currentRoom
            );


        if (homeScreen) {

            homeScreen.style.display =
                "none";
        }


        if (callScreen) {

            callScreen.style.display =
                "block";

            callScreen.classList.add(
                "active"
            );
        }


        if (roomLabel) {

            roomLabel.textContent =
                "Private 1 vs 1 Call";
        }


        if (meet) {

            meet.innerHTML =
                "";
        }


        jitsiApi =
            new window.JitsiMeetExternalAPI(
                JAAS_DOMAIN,
                {

                    roomName:
                        JAAS_APP_ID +
                        "/" +
                        currentRoom,

                    parentNode:
                        meet,

                    jwt:
                        token,

                    width:
                        "100%",

                    height:
                        "100%",

                    userInfo: {

                        displayName:
                            getMyName()
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
                }
            );


        jitsiApi.addEventListener(
            "videoConferenceJoined",
            function () {

                console.log(
                    "JaaS joined"
                );
            }
        );


        jitsiApi.addEventListener(
            "readyToClose",
            function () {

                leaveJaaSCall();
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


        await leaveJaaSCall();
    }
}


/* ============================================================
   LEAVE JAAS
============================================================ */

async function leaveJaaSCall() {

    if (leavingJitsi) {
        return;
    }


    leavingJitsi =
        true;


    try {

        if (jitsiApi) {

            try {

                jitsiApi.dispose();

            } catch (error) {

                console.error(
                    "Jitsi dispose:",
                    error
                );
            }


            jitsiApi =
                null;
        }


        if (meet) {

            meet.innerHTML =
                "";
        }


        if (callScreen) {

            callScreen.style.display =
                "none";

            callScreen.classList.remove(
                "active"
            );
        }


        if (homeScreen) {

            homeScreen.style.display =
                "";
        }


        if (currentCallId) {

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

                console.error(
                    "End call:",
                    error
                );
            }
        }


    } finally {

        resetCallState();

        leavingJitsi =
            false;


        await registerPresence();

        await pollOnlineUsers();
    }
}


/* ============================================================
   BACK
============================================================ */

if (backButton) {

    backButton.addEventListener(
        "click",
        async function () {

            await leaveJaaSCall();

        }
    );
}


/* ============================================================
   RESET
============================================================ */

function resetCallState() {

    stopCallStatusPolling();


    currentCallId =
        "";

    currentRoom =
        "";

    currentCallRole =
        "";

    currentReceiverId =
        "";

    currentReceiverName =
        "";


    incomingCall =
        null;

    incomingCallVisible =
        false;


    hideIncomingCall();

    hideOutgoingCall();
}


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


window.refreshOnlineUsers =
    function () {

        return refreshOnlineUsers();
    };


/* ============================================================
   INITIALIZE
============================================================ */

async function initializeApp() {

    loadMyName();


    if (getMyName()) {

        await startPresence();

    } else {

        showNoUsers();

        setConnectionStatus(
            "Enter your name",
            "offline"
        );
    }
}


initializeApp().catch(
    function (error) {

        console.error(
            "Initialization:",
            error
        );


        setConnectionStatus(
            "Connection error",
            "error"
        );
    }
);
