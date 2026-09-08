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
   INCOMING CALL UI
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
   OUTGOING CALL UI
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
let usersPollBusy = false;

let leavingJitsi = false;

let nameUpdateTimer = null;

let jitsiApi = null;


/* ============================================================
   USER ID
   IMPORTANT:
   sessionStorage = each browser tab gets its own ID.
   This fixes same-browser multi-user testing.
============================================================ */

function getUserId() {
  try {
    let id = sessionStorage.getItem("video_call_user_id");

    if (id) {
      return id;
    }

    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      id = window.crypto.randomUUID();
    } else {
      id =
        "u-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 12);
    }

    sessionStorage.setItem("video_call_user_id", id);

    return id;
  } catch (error) {
    let id =
      "u-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 12);

    return id;
  }
}

const myUserId = getUserId();


/* ============================================================
   NAME
============================================================ */

function loadMyName() {
  try {
    const saved =
      localStorage.getItem("video_call_name") || "";

    currentName = saved.trim();

    if (nameInput) {
      nameInput.value = currentName;
    }

    return currentName;
  } catch (error) {
    currentName = "";

    if (nameInput) {
      nameInput.value = "";
    }

    return "";
  }
}


function getMyName() {
  if (nameInput && nameInput.value.trim()) {
    return nameInput.value.trim();
  }

  try {
    return (
      localStorage.getItem("video_call_name") || ""
    ).trim();
  } catch (error) {
    return currentName || "";
  }
}


function saveMyName(name) {
  name = String(name || "").trim();

  currentName = name;

  try {
    if (name) {
      localStorage.setItem("video_call_name", name);
    } else {
      localStorage.removeItem("video_call_name");
    }
  } catch (error) {
    /* ignore */
  }
}


function getInitial(name) {
  const value = String(name || "").trim();

  if (!value) {
    return "?";
  }

  return value.charAt(0).toUpperCase();
}


/* ============================================================
   CONNECTION STATUS
============================================================ */

function setConnectionStatus(text, type) {
  if (!connectionStatus) {
    return;
  }

  connectionStatus.textContent = text || "";

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
   API REQUEST
============================================================ */

async function apiRequest(path, body = {}, options = {}) {
  const method = options.method || "POST";

  const requestOptions = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  if (method !== "GET" && method !== "HEAD") {
    requestOptions.body = JSON.stringify(body);
  }

  if (options.keepalive) {
    requestOptions.keepalive = true;
  }

  const response = await fetch(API + path, requestOptions);

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      ("HTTP " + response.status)
    );
  }

  return data;
}


/* ============================================================
   INTERNAL ROOM
   User never sees this.
============================================================ */

function generatePrivateRoom() {
  const random =
    Math.random()
      .toString(36)
      .slice(2, 12);

  return (
    "call-" +
    Date.now().toString(36) +
    "-" +
    random
  );
}


/* ============================================================
   NO USERS
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
    onlineUsers.appendChild(noUsersMessage);
    noUsersMessage.style.display = "";
  } else {
    const empty = document.createElement("div");

    empty.className = "no-users-fallback";
    empty.textContent = "No other users online";

    onlineUsers.appendChild(empty);
  }
}


/* ============================================================
   REGISTER PRESENCE
============================================================ */

async function registerPresence() {
  if (presenceBusy) {
    return false;
  }

  const name = getMyName();

  if (!name) {
    setConnectionStatus(
      "Enter your name",
      "offline"
    );

    showNoUsers();

    return false;
  }

  presenceBusy = true;

  try {
    const data = await apiRequest(
      "/presence/online",
      {
        userId: myUserId,
        name: name
      }
    );

    currentName = name;

    setConnectionStatus(
      "Online",
      "online"
    );

    return !!(data && data.ok);
  } catch (error) {
    setConnectionStatus(
      "Connection error",
      "error"
    );

    console.error(
      "Presence online error:",
      error
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
  if (usersPollBusy) {
    return;
  }

  const name = getMyName();

  if (!name) {
    showNoUsers();
    return;
  }

  usersPollBusy = true;

  try {
    const data = await apiRequest(
      "/presence/poll",
      {
        userId: myUserId
      }
    );

    if (
      !data ||
      !Array.isArray(data.users)
    ) {
      console.warn(
        "Invalid presence response:",
        data
      );

      showNoUsers();

      return;
    }

    const users = data.users
      .map(function (user) {
        if (!user) {
          return null;
        }

        const userId =
          String(user.userId || "").trim();

        const userName =
          String(user.name || "").trim();

        const status =
          String(user.status || "online").trim();

        if (!userId || !userName) {
          return null;
        }

        return {
          userId: userId,
          name: userName,
          status: status
        };
      })
      .filter(function (user) {
        return (
          user &&
          user.userId !== myUserId
        );
      });

    renderOnlineUsers(users);

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
      Do NOT immediately destroy the existing
      user list on a temporary network error.
    */
  } finally {
    usersPollBusy = false;
  }
}


/* ============================================================
   RENDER ONLINE USERS
============================================================ */

function renderOnlineUsers(users) {
  if (!onlineUsers) {
    return;
  }

  const list = Array.isArray(users)
    ? users
        .filter(function (user) {
          return (
            user &&
            user.userId &&
            user.name &&
            user.userId !== myUserId
          );
        })
        .slice()
    : [];

  list.sort(function (a, b) {
    const aBusy =
      String(a.status).toLowerCase() === "busy";

    const bBusy =
      String(b.status).toLowerCase() === "busy";

    if (aBusy !== bBusy) {
      return aBusy ? 1 : -1;
    }

    return String(a.name).localeCompare(
      String(b.name)
    );
  });

  onlineUsers.innerHTML = "";

  if (onlineCount) {
    onlineCount.textContent =
      String(list.length);
  }

  if (list.length === 0) {
    showNoUsers();
    return;
  }

  list.forEach(function (user) {
    const item =
      document.createElement("div");

    item.className =
      "online-user-item";

    item.dataset.userId =
      user.userId;

    item.dataset.userName =
      user.name;


    /* --------------------------------------------------------
       INFO
    -------------------------------------------------------- */

    const info =
      document.createElement("div");

    info.className =
      "online-user-info";


    /* --------------------------------------------------------
       AVATAR
    -------------------------------------------------------- */

    const avatar =
      document.createElement("div");

    avatar.className =
      "online-user-avatar";

    avatar.textContent =
      getInitial(user.name);


    /* --------------------------------------------------------
       TEXT
    -------------------------------------------------------- */

    const text =
      document.createElement("div");

    text.className =
      "online-user-text";


    const name =
      document.createElement("div");

    name.className =
      "online-user-name";

    name.textContent =
      user.name;


    const status =
      document.createElement("div");

    status.className =
      "online-user-status";


    const dot =
      document.createElement("span");

    dot.className =
      "online-status-dot";


    const isBusy =
      String(user.status).toLowerCase() ===
      "busy";

    if (isBusy) {
      status.appendChild(dot);
      status.appendChild(
        document.createTextNode(" Busy")
      );
    } else {
      status.appendChild(dot);
      status.appendChild(
        document.createTextNode(" Online")
      );
    }


    text.appendChild(name);
    text.appendChild(status);

    info.appendChild(avatar);
    info.appendChild(text);


    /* --------------------------------------------------------
       CALL BUTTON
    -------------------------------------------------------- */

    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "online-call-button";

    button.dataset.userId =
      user.userId;

    button.dataset.userName =
      user.name;

    if (isBusy) {
      button.classList.add("busy");
      button.disabled = true;
      button.textContent = "Busy";
    } else {
      button.textContent = "Call";
    }


    item.appendChild(info);
    item.appendChild(button);

    onlineUsers.appendChild(item);
  });
}


/* ============================================================
   REFRESH ONLINE USERS
============================================================ */

async function refreshOnlineUsers() {
  const name = getMyName();

  if (!name) {
    showNoUsers();

    setConnectionStatus(
      "Enter your name",
      "offline"
    );

    return;
  }

  await registerPresence();
  await pollOnlineUsers();
}


/* ============================================================
   ONLINE USER CLICK
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
          button.dataset.userId || ""
        ).trim();

      const receiverName =
        String(
          button.dataset.userName || ""
        ).trim();

      if (!receiverId || !receiverName) {
        return;
      }

      if (receiverId === myUserId) {
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
      const name =
        nameInput.value.trim();

      currentName = name;

      if (nameUpdateTimer) {
        clearTimeout(nameUpdateTimer);
      }

      nameUpdateTimer =
        setTimeout(
          async function () {
            if (!name) {
              try {
                localStorage.removeItem(
                  "video_call_name"
                );
              } catch (error) {
                /* ignore */
              }

              showNoUsers();

              setConnectionStatus(
                "Enter your name",
                "offline"
              );

              return;
            }

            saveMyName(name);

            await registerPresence();
            await pollOnlineUsers();
          },
          500
        );
    }
  );
}


/* ============================================================
   START PRESENCE
============================================================ */

async function startPresence() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }

  if (usersTimer) {
    clearInterval(usersTimer);
    usersTimer = null;
  }

  loadMyName();

  const name = getMyName();

  if (!name) {
    showNoUsers();

    setConnectionStatus(
      "Enter your name",
      "offline"
    );

    return;
  }

  await registerPresence();
  await pollOnlineUsers();


  /*
    Heartbeat:
    8 seconds
  */

  presenceTimer =
    setInterval(
      async function () {
        if (
          presenceBusy ||
          usersPollBusy ||
          leavingJitsi
        ) {
          return;
        }

        const current =
          getMyName();

        if (!current) {
          return;
        }

        await registerPresence();
      },
      8000
    );


  /*
    User list:
    3 seconds
  */

  usersTimer =
    setInterval(
      async function () {
        if (
          usersPollBusy ||
          leavingJitsi
        ) {
          return;
        }

        if (!getMyName()) {
          return;
        }

        await pollOnlineUsers();
      },
      3000
    );
}


/* ============================================================
   OFFLINE
============================================================ */

function setOffline() {
  const payload = JSON.stringify({
    userId: myUserId
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
        API + "/presence/offline",
        blob
      );

      return;
    }
  } catch (error) {
    /* fallback below */
  }

  try {
    fetch(
      API + "/presence/offline",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: payload,
        keepalive: true
      }
    ).catch(function () {});
  } catch (error) {
    /* ignore */
  }
}


/* ============================================================
   PAGE HIDE
============================================================ */

window.addEventListener(
  "pagehide",
  function () {
    setOffline();
  }
);


/* ============================================================
   REFRESH BUTTON
============================================================ */

if (refreshUsersButton) {
  refreshUsersButton.addEventListener(
    "click",
    async function () {
      refreshUsersButton.disabled = true;

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
  if (!receiverId || !receiverName) {
    return;
  }

  if (receiverId === myUserId) {
    return;
  }

  if (currentCallId) {
    return;
  }

  const name =
    getMyName();

  if (!name) {
    alert("Please enter your name first.");
    return;
  }

  currentName = name;

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
          callerId: myUserId,
          callerName: name,
          receiverId: receiverId,
          receiverName: receiverName,
          room: currentRoom
        }
      );

    if (
      !data ||
      !data.ok ||
      !data.call
    ) {
      throw new Error(
        data &&
        (data.error || data.message)
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

function showOutgoingCall(name) {
  if (outgoingReceiverName) {
    outgoingReceiverName.textContent =
      name || "";
  }

  if (outgoingOverlay) {
    outgoingOverlay.classList.add("show");
    outgoingOverlay.style.display = "";
  }
}


function hideOutgoingCall() {
  if (outgoingOverlay) {
    outgoingOverlay.classList.remove("show");

    if (
      outgoingOverlay.style.display
    ) {
      outgoingOverlay.style.display =
        "none";
    }
  }
}


/* ============================================================
   INCOMING UI
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
      call.callerName || "Unknown";
  }

  if (incomingOverlay) {
    incomingOverlay.classList.add("show");
    incomingOverlay.style.display = "";
  }
}


function hideIncomingCall() {
  incomingCallVisible =
    false;

  incomingCall =
    null;

  if (incomingOverlay) {
    incomingOverlay.classList.remove("show");

    if (
      incomingOverlay.style.display
    ) {
      incomingOverlay.style.display =
        "none";
    }
  }
}


/* ============================================================
   POLL INCOMING CALLS
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
          userId: myUserId
        }
      );

    if (
      !data ||
      !Array.isArray(data.calls)
    ) {
      return;
    }

    if (
      data.calls.length === 0
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

    showIncomingCall(call);

  } catch (error) {
    console.error(
      "Incoming call poll:",
      error
    );
  }
}


/* ============================================================
   INCOMING CALL TIMER
============================================================ */

if (incomingCallTimer) {
  clearInterval(
    incomingCallTimer
  );
}

incomingCallTimer =
  setInterval(
    async function () {
      await pollIncomingCalls();
    },
    1200
  );


/* ============================================================
   ACCEPT CALL
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
              callId: call.callId,
              userId: myUserId
            }
          );

        if (
          !data ||
          !data.ok
        ) {
          throw new Error(
            data &&
            (data.error || data.message)
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
   DECLINE CALL
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
            callId: call.callId,
            userId: myUserId
          }
        );
      } catch (error) {
        console.error(
          "Decline error:",
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
   CANCEL OUTGOING CALL
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
        callId: callId,
        userId: myUserId
      }
    );
  } catch (error) {
    console.error(
      "Cancel error:",
      error
    );
  }

  resetCallState();
}


/* ============================================================
   CALL STATUS
============================================================ */

function startCallStatusPolling() {
  if (callStatusTimer) {
    clearInterval(
      callStatusTimer
    );
  }

  callStatusTimer =
    setInterval(
      async function () {
        await pollCallStatus();
      },
      1200
    );
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
          callId: currentCallId,
          userId: myUserId
        }
      );

    if (!data) {
      return;
    }

    const status =
      String(
        data.status ||
        (data.call &&
          data.call.status) ||
        ""
      ).toLowerCase();

    if (
      status === "accepted"
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
      status === "declined" ||
      status === "cancelled" ||
      status === "canceled" ||
      status === "ended"
    ) {
      stopCallStatusPolling();

      hideOutgoingCall();
      hideIncomingCall();

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


function stopCallStatusPolling() {
  if (callStatusTimer) {
    clearInterval(
      callStatusTimer
    );

    callStatusTimer =
      null;
  }
}


/* ============================================================
   JAAS TOKEN
============================================================ */

async function getJaasToken(room) {
  const data =
    await apiRequest(
      "/token",
      {
        userId: myUserId,
        name: getMyName(),
        room: room
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
   LOAD JAAS SCRIPT
============================================================ */

function loadJaaSScript() {
  return new Promise(
    function (resolve, reject) {
      if (
        window.JitsiMeetExternalAPI
      ) {
        resolve();
        return;
      }

      const existing =
        document.querySelector(
          'script[data-jaas-external-api="1"]'
        );

      if (existing) {
        existing.addEventListener(
          "load",
          function () {
            resolve();
          },
          { once: true }
        );

        existing.addEventListener(
          "error",
          function () {
            reject(
              new Error(
                "Unable to load JaaS."
              )
            );
          },
          { once: true }
        );

        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://" +
        JAAS_DOMAIN +
        "/" +
        JAAS_APP_ID +
        "/external_api.js";

      script.async = true;

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

    if (
      homeScreen
    ) {
      homeScreen.style.display =
        "none";
    }

    if (
      callScreen
    ) {
      callScreen.style.display =
        "block";
    }

    if (
      roomLabel
    ) {
      /*
        Internal room only.
        Do not expose it as an input.
      */
      roomLabel.textContent =
        "Private 1 vs 1 Call";
    }

    if (
      meet
    ) {
      meet.innerHTML = "";
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


    /*
      JaaS joined
    */

    jitsiApi.addEventListener(
      "videoConferenceJoined",
      function () {
        console.log(
          "JaaS joined"
        );
      }
    );


    /*
      User leaves meeting
    */

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

    leaveJaaSCall();
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
      meet.innerHTML = "";
    }

    if (callScreen) {
      callScreen.style.display =
        "none";
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
   BACK BUTTON
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
   RESET CALL STATE
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
   INITIALIZE
============================================================ */

async function initializeApp() {
  loadMyName();

  /*
    If name already exists:
    register immediately.
  */

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


/* ============================================================
   START
============================================================ */

initializeApp().catch(
  function (error) {
    console.error(
      "Initialization error:",
      error
    );

    setConnectionStatus(
      "Connection error",
      "error"
    );
  }
);
