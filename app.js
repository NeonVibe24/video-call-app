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
   STATE
============================================================ */

let jitsiApi = null;

let currentRoom = "";

let currentName = "";

let currentCallId = "";

let currentCallRole = "";

let callStatusTimer = null;

let incomingCallTimer = null;

let incomingCallVisible = false;


/* ============================================================
   API
============================================================ */

const API =
    "/api";


/* ============================================================
   USER ID
============================================================ */

function getUserId() {

    let userId =
        localStorage.getItem(
            "video_call_user_id"
        );


    if (!userId) {

        userId =
            crypto.randomUUID();


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
   SAVE NAME
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
                    () => resolve()
                );


                oldScript.addEventListener(
                    "error",
                    () =>
                        reject(
                            new Error(
                                "JaaS API failed to load."
                            )
                        )
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
   CLEAN INPUT
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
   API REQUEST HELPER
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
                        body
                    )

            }
        );


    let data;


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
   INCOMING CALL UI
============================================================ */

function createIncomingCallUI() {

    if (
        document.getElementById(
            "incomingCallOverlay"
        )
    ) {

        return;

    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "incomingCallOverlay";


    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.78);
        backdrop-filter: blur(10px);
    `;


    const box =
        document.createElement(
            "div"
        );


    box.id =
        "incomingCallBox";


    box.style.cssText = `
        width: min(90%, 360px);
        box-sizing: border-box;
        padding: 28px 22px;
        border-radius: 24px;
        background: #171717;
        color: #fff;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,.5);
    `;


    const avatar =
        document.createElement(
            "div"
        );


    avatar.id =
        "incomingCallAvatar";


    avatar.textContent =
        "📞";


    avatar.style.cssText = `
        width: 82px;
        height: 82px;
        margin: 0 auto 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #252525;
        font-size: 38px;
    `;


    const title =
        document.createElement(
            "div"
        );


    title.textContent =
        "Incoming Call";


    title.style.cssText = `
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
    `;


    const caller =
        document.createElement(
            "div"
        );


    caller.id =
        "incomingCallerName";


    caller.style.cssText = `
        font-size: 18px;
        opacity: .9;
        margin-bottom: 26px;
    `;


    const buttons =
        document.createElement(
            "div"
        );


    buttons.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: center;
    `;


    const decline =
        document.createElement(
            "button"
        );


    decline.id =
        "incomingDeclineButton";


    decline.textContent =
        "Decline";


    decline.style.cssText = `
        flex: 1;
        border: 0;
        padding: 14px 10px;
        border-radius: 14px;
        background: #d93636;
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
    `;


    const accept =
        document.createElement(
            "button"
        );


    accept.id =
        "incomingAcceptButton";


    accept.textContent =
        "Accept";


    accept.style.cssText = `
        flex: 1;
        border: 0;
        padding: 14px 10px;
        border-radius: 14px;
        background: #25b35b;
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
    `;


    buttons.appendChild(
        decline
    );


    buttons.appendChild(
        accept
    );


    box.appendChild(
        avatar
    );


    box.appendChild(
        title
    );


    box.appendChild(
        caller
    );


    box.appendChild(
        buttons
    );


    overlay.appendChild(
        box
    );


    document.body.appendChild(
        overlay
    );


    accept.addEventListener(
        "click",
        acceptIncomingCall
    );


    decline.addEventListener(
        "click",
        declineIncomingCall
    );

}


createIncomingCallUI();


/* ============================================================
   SHOW INCOMING CALL
============================================================ */

function showIncomingCall(
    call
) {

    if (
        incomingCallVisible
    ) {

        return;

    }


    incomingCallVisible =
        true;


    const overlay =
        document.getElementById(
            "incomingCallOverlay"
        );


    const caller =
        document.getElementById(
            "incomingCallerName"
        );


    if (!overlay) {

        return;

    }


    if (caller) {

        caller.textContent =
            call.callerName ||
            "Someone";

    }


    overlay.style.display =
        "flex";


    window.__incomingCall =
        call;

}


/* ============================================================
   HIDE INCOMING CALL
============================================================ */

function hideIncomingCall() {

    incomingCallVisible =
        false;


    const overlay =
        document.getElementById(
            "incomingCallOverlay"
        );


    if (overlay) {

        overlay.style.display =
            "none";

    }


    window.__incomingCall =
        null;

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


    const button =
        document.getElementById(
            "incomingAcceptButton"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Connecting...";

    }


    try {

        await apiRequest(
            "/call/accept",
            {

                callId:
                    call.callId,

                userId:
                    myUserId

            }
        );


        hideIncomingCall();


        currentCallId =
            call.callId;


        currentCallRole =
            "receiver";


        currentName =
            nameInput.value.trim() ||
            "User";


        currentRoom =
            call.room;


        /*
         * Only now open JaaS.
         */

        await startJaaSCall(
            currentName,
            currentRoom
        );


    } catch (error) {

        console.error(
            error
        );


        alert(
            error.message ||
            "Could not accept the call."
        );


        hideIncomingCall();

    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
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
            error
        );

    }


    hideIncomingCall();

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
            data.calls.length
        ) {

            const call =
                data.calls[0];


            if (
                call &&
                call.status ===
                    "ringing"
            ) {

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

        return;

    }


    pollIncomingCalls();


    incomingCallTimer =
        setInterval(
            pollIncomingCalls,
            1500
        );

}


startIncomingCallPolling();


/* ============================================================
   CREATE CALL
============================================================ */

async function createOutgoingCall(
    receiverId,
    receiverName,
    callerName
) {

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


    /*
     * Caller does NOT open JaaS yet.
     *
     * First wait for receiver.
     */

    showCallingScreen(
        receiverName
    );


    startCallStatusPolling();

}


/* ============================================================
   CALLING UI
============================================================ */

function showCallingScreen(
    receiverName
) {

    homeScreen.style.display =
        "none";


    callScreen.classList.add(
        "active"
    );


    roomLabel.textContent =
        "Calling " +
        (
            receiverName ||
            "User"
        ) +
        "...";


    meet.innerHTML = `

        <div
            id="callingScreen"
            style="
                width:100%;
                height:100%;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                text-align:center;
                color:white;
                gap:14px;
            "
        >

            <div
                style="
                    width:90px;
                    height:90px;
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:#252525;
                    font-size:42px;
                    animation:callPulse 1.5s infinite;
                "
            >
                📞
            </div>

            <div
                style="
                    font-size:24px;
                    font-weight:700;
                "
            >
                Calling...
            </div>

            <div
                style="
                    opacity:.7;
                    font-size:15px;
                "
            >
                Waiting for the other person to accept
            </div>

            <button
                id="cancelCallButton"
                style="
                    margin-top:20px;
                    border:0;
                    border-radius:14px;
                    padding:13px 28px;
                    background:#d93636;
                    color:white;
                    font-size:16px;
                    cursor:pointer;
                "
            >
                Cancel
            </button>

        </div>

        <style>
            @keyframes callPulse {

                0% {
                    transform:scale(1);
                }

                50% {
                    transform:scale(1.08);
                }

                100% {
                    transform:scale(1);
                }

            }
        </style>

    `;


    const cancelButton =
        document.getElementById(
            "cancelCallButton"
        );


    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            cancelOutgoingCall
        );

    }

}


/* ============================================================
   STATUS POLLING
============================================================ */

function startCallStatusPolling() {

    stopCallStatusPolling();


    checkOutgoingCallStatus();


    callStatusTimer =
        setInterval(
            checkOutgoingCallStatus,
            1500
        );

}


/* ============================================================
   STOP STATUS POLLING
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

        resetCallState();

        return;

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

        console.error(
            error
        );

    }


    stopCallStatusPolling();


    resetCallState();

}


/* ============================================================
   START JaaS CALL
============================================================ */

async function startJaaSCall(
    name,
    room
) {

    joinButton.disabled =
        true;


    createButton.disabled =
        true;


    try {

        currentName =
            name;


        currentRoom =
            room;


        saveMyName(
            name
        );


        /*
         * Ask Cloudflare Worker
         * for JaaS JWT.
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
         * Load JaaS IFrame API.
         */

        await loadJaaSApi(
            data.appId
        );


        /*
         * Show call screen.
         */

        homeScreen.style.display =
            "none";


        callScreen.classList.add(
            "active"
        );


        roomLabel.textContent =
            room;


        /*
         * Remove old meeting.
         */

        meet.innerHTML =
            "";


        if (
            jitsiApi
        ) {

            try {

                jitsiApi.dispose();

            } catch (_) {}


            jitsiApi =
                null;

        }


        /*
         * Create JaaS meeting.
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
         * Call ended.
         */

        jitsiApi.addEventListener(
            "videoConferenceLeft",
            () => {

                leaveCall();

            }
        );


    } catch (error) {

        console.error(
            error
        );


        alert(
            error.message ||
            "Unable to start video call."
        );


        leaveCall();

    } finally {

        joinButton.disabled =
            false;

        createButton.disabled =
            false;

    }

}


/* ============================================================
   OLD JOIN BUTTON
============================================================ */

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


        /*
         * Existing direct room join
         * remains available.
         */

        currentCallId =
            "";


        currentCallRole =
            "";


        await startJaaSCall(
            name,
            room
        );

    }
);


/* ============================================================
   CREATE BUTTON
============================================================ */

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


        const room =
            generateRoom();


        roomInput.value =
            room;


        /*
         * Keep original Create Room behavior.
         */

        await startJaaSCall(
            name,
            room
        );

    }
);


/* ============================================================
   ENTER KEY
============================================================ */

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


/* ============================================================
   NEW CALL HELPER
============================================================ */

/*
 * This function can be called later by the UI:
 *
 * callUser("USER_ID", "User Name");
 *
 * We will connect this to the new index.html
 * in the next step.
 */

window.callUser =
    async function (
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


        if (
            !receiverId
        ) {

            alert(
                "Receiver User ID is required."
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


        saveMyName(
            callerName
        );


        try {

            await createOutgoingCall(
                receiverId,
                receiverName ||
                    "User",
                callerName
            );

        } catch (error) {

            console.error(
                error
            );


            alert(
                error.message ||
                "Could not start the call."
            );


        }

    };


/* ============================================================
   GET MY USER ID
============================================================ */

/*
 * Useful for the next UI.
 *
 * Example:
 *
 * console.log(window.getMyUserId());
 */

window.getMyUserId =
    function () {

        return myUserId;

    };


/* ============================================================
   LEAVE
============================================================ */

function leaveCall() {

    stopCallStatusPolling();


    if (
        jitsiApi
    ) {

        try {

            jitsiApi.dispose();

        } catch (_) {}


        jitsiApi =
            null;

    }


    meet.innerHTML =
        "";


    callScreen.classList.remove(
        "active"
    );


    homeScreen.style.display =
        "flex";


    currentRoom =
        "";


    currentCallId =
        "";


    currentCallRole =
        "";


    currentName =
        nameInput.value.trim();

}


/* ============================================================
   RESET CALL STATE
============================================================ */

function resetCallState() {

    stopCallStatusPolling();


    if (
        jitsiApi
    ) {

        try {

            jitsiApi.dispose();

        } catch (_) {}


        jitsiApi =
            null;

    }


    meet.innerHTML =
        "";


    callScreen.classList.remove(
        "active"
    );


    homeScreen.style.display =
        "flex";


    currentRoom =
        "";


    currentCallId =
        "";


    currentCallRole =
        "";


}


/* ============================================================
   BACK BUTTON
============================================================ */

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

            leaveCall();

        }

    }
);


/* ============================================================
   COPY ROOM
============================================================ */

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


/* ============================================================
   BEFORE UNLOAD
============================================================ */

window.addEventListener(
    "beforeunload",
    () => {

        /*
         * Stop local timers.
         */

        stopCallStatusPolling();


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
);
