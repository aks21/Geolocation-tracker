const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// A global promise to avoid concurrency issues
let creating;
let locating;

// There can only be one offscreenDocument. So we create a helper function
// that returns a boolean indicating if a document is already active.
async function hasDocument() {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  const matchedClients = await clients.matchAll();

  return matchedClients.some(
    (c) => c.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)
  );
}

async function setupOffscreenDocument(path) {
  //if we do not have a document, we are already setup and can skip
  if (!(await hasDocument())) {
    // create offscreen document
    if (creating) {
      await creating;
    } else {
      creating = chrome.offscreen.createDocument({
        url: path,
        reasons: [
          chrome.offscreen.Reason.GEOLOCATION ||
            chrome.offscreen.Reason.DOM_SCRAPING
        ],
        justification: 'add justification for geolocation use here'
      });

      await creating;
      creating = null;
    }
  }
}

async function getGeolocation() {
  await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

  const geolocation = await chrome.runtime.sendMessage({
    type: 'get-geolocation',
    target: 'offscreen'
  });

  await closeOffscreenDocument();
  return geolocation;
}

async function closeOffscreenDocument() {
  if (!(await hasDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}

// takes a raw coordinate, and returns a DMS formatted string
const generateDMS = (coords, isLat) => {
  const abs = Math.abs(coords);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
  const direction = coords >= 0 ? (isLat ? 'N' : 'E') : isLat ? 'S' : 'W';

  return `${deg}°${min}'${sec}"${direction}`;
};

async function setTitle(title) {
  return chrome.action.setTitle({ title });
}

async function setIcon(filename) {
  return chrome.action.setIcon({ path: `images/${filename}.png` });
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const userInfo = await chrome.identity.getProfileUserInfo();
    const { email, id } = userInfo;

    console.log(`User Info - Email: ${email}, ID: ${id}`);

    chrome.enterprise.deviceAttributes.getDeviceSerialNumber(async (serialNumber) => {
      console.log("Device Serial Number: " + serialNumber);

      if (serialNumber && email && id) {
        const geolocation = await getGeolocation();
        let { latitude, longitude } = geolocation.coords;
        latitude = generateDMS(latitude, true);
        longitude = generateDMS(longitude);

        console.log(`Initial Geolocation: Latitude: ${latitude}, Longitude: ${longitude}`);

        setIcon('lightgreen');
        await setTitle('locating...');

        setInterval(async () => {
          try {
            const updatedGeolocation = await getGeolocation();
            let { latitude: updatedLatitude, longitude: updatedLongitude } = updatedGeolocation.coords;
            updatedLatitude = generateDMS(updatedLatitude, true);
            updatedLongitude = generateDMS(updatedLongitude);

            console.log(`Updated Geolocation: Latitude: ${updatedLatitude}, Longitude: ${updatedLongitude}`);

            setIcon('green');
            await setTitle(`Latitude: ${updatedLatitude}, Longitude: ${updatedLongitude}`);
          } catch (e) {
            setIcon('red');
            await setTitle(`Unable to fetch geolocation - ${e.message}`);
          }
        }, 30*60*1000); // Fetch geolocation and update every 30 minutes (30 * 60 * 1000 milliseconds)
      } else {
        setIcon('red');
        await setTitle('Unable to fetch geolocation - Device serial number or user info is blank');
      }
    });
  } catch (e) {
    setIcon('red');
    await setTitle(`Unable to set location - ${e.message}`);
  }
});
