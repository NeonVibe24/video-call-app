const startCallBtn = document.getElementById("startCallBtn");
const status = document.getElementById("status");

startCallBtn.addEventListener("click", () => {

status.textContent = "Starting...";

/*
 * JaaS Video Call
 * will be connected here.
 */

alert("JaaS Video Call will be connected here.");

status.textContent = "Ready";

});
