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


/* ============================================================
   LOAD JaaS API
============================================================ */

function loadJaaSApi(appId) {

    return new Promise(
        (resolve, reject) => {

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
                document.createElement("script");

            script.src =
                "https://8x8.vc/" +
                encodeURIComponent(appId) +
                "/external_api.js";

            script.async = true;

            script.dataset.jaasApi = "true";


            script.onload = () => {
                resolve();
            };


            script.onerror = () => {

                reject(
                    new Error(
                        "Could not load JaaS IFrame API."
                    )
                );

            };


            document.head.appendChild(script);

        }
    );

}


/* ============================================================
   GENERATE ROOM
============================================================ */

function generateRoom() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let room = "";

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
   JOIN BUTTON
============================================================ */

joinButton.addEventListener(
    "click",
    async () => {

        const name =
            nameInput.value.trim();

        const room =
            cleanRoom(roomInput.value);


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


        await startCall(
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


        const room =
            generateRoom();


        roomInput.value =
            room;


        await startCall(
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
   START CALL
============================================================ */

async function startCall(
    name,
    room
) {

    joinButton.disabled = true;

    createButton.disabled = true;


    try {

        currentName = name;

        currentRoom = room;


        /*
         * Ask our Cloudflare Worker
         * for a short-lived JaaS JWT.
         */

        const response =
            await fetch(
                "/api/token",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        name: name,
                        room: room
                    })
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.token ||
            !data.appId
        ) {

            throw new Error(
                data.error ||
                "Could not create JaaS token."
            );

        }


        /*
         * Load JaaS IFrame API
         */

        await loadJaaSApi(
            data.appId
        );


        /*
         * Show call screen
         */

        homeScreen.style.display =
            "none";

        callScreen.classList.add(
            "active"
        );


        roomLabel.textContent =
            room;


        /*
         * Remove old meeting
         */

        meet.innerHTML = "";


        if (jitsiApi) {

            try {
                jitsiApi.dispose();
            } catch (_) {}

            jitsiApi = null;

        }


        /*
         * Create JaaS meeting
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

                    width: "100%",

                    height: "100%",


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
         * Call ended
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
   LEAVE
============================================================ */

function leaveCall() {

    if (jitsiApi) {

        try {
            jitsiApi.dispose();
        } catch (_) {}

        jitsiApi = null;

    }


    meet.innerHTML = "";


    callScreen.classList.remove(
        "active"
    );


    homeScreen.style.display =
        "flex";


    currentRoom = "";

}


/* ============================================================
   BACK
============================================================ */

backButton.addEventListener(
    "click",
    () => {

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

        if (!currentRoom) {
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
