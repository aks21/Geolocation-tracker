chrome.runtime.onMessage.addListener(handleMessages);

chrome.runtime.sendMessage({ action: "getSerialNumber" }, (response) => {
  document.getElementById("serialNumber").textContent = response.serialNumber;
});

function handleMessages(message, sender, sendResponse) {
  // Return early if this message isn't meant for the offscreen document.
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type !== 'get-geolocation') {
    console.warn(`Unexpected message type received: '${message.type}'.`);
    return;
  }

  getGeolocation().then((geolocation) => sendResponse(geolocation));

  // we need to explictly return true in our chrome.runtime.onMessage handler
  // in order to allow the requestor to handle the request asynchronous.
  return true;
}

// getCurrentPosition returns a prototype based object, so the properties
// end up being stripped off when sent over to our service worker. To get
// around this, we deeply clone it
function clone(obj) {
  const copy = {};

  // Return the value of any non true object (typeof(null) is "object") directly.
  // null will throw an error if you try to for/in it. We can just return
  // the value early.
  if (obj === null || !(obj instanceof Object)) {
    return obj;
  } else {
    for (const p in obj) {
      copy[p] = clone(obj[p]);
    }
  }
  return copy;
}

async function getGeolocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (loc) => resolve(clone(loc)),
      // in case the user doesnt have or is blocking `geolocation`
      (err) => reject(err)
    );
  });
}
