/* PawCare VPN-aware location lookup
 * Reads the public IP location seen by the PawCare Worker. If the visitor has
 * connected a VPN, the Worker normally sees the VPN exit IP. This does NOT
 * connect, enable, or detect a VPN; it only reports the IP-based estimate.
 * PawCare's directory remains U.S.-only.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = "https://pawsitive-api.brigitteiannotta3.workers.dev";
  const message = value => { const el = $("pawcareLocationMessage"); if (el) el.textContent = value; };

  function stateCode(value) {
    if (!value) return null;
    const v = String(value).trim().toLowerCase().replace(/\./g, "");
    for (const [code, name] of Object.entries(US_STATES)) {
      if (code.toLowerCase() === v || name.toLowerCase() === v) return code;
    }
    return null;
  }

  function setSource(source) {
    try { localStorage.setItem("pawcare-location-source", source); } catch (_) {}
  }

  function apply(city, state, source, note) {
    const code = stateCode(state);
    const clean = String(city || "").trim();
    if (!code || !clean || clean.length > 60) {
      message("We couldn't match that location to a U.S. city and state. Choose a U.S. city manually.");
      return false;
    }
    currentLocation = makeLoc(clean, code);
    setSource(source);
    saveLocation();
    updateLocationUI();
    renderListings();
    if ($("stateSelect")) {
      $("stateSelect").value = code;
      if (typeof fillCityOptions === "function") fillCityOptions(code, clean);
    }
    const status = $("statusText");
    if (status) status.textContent = `${source === "vpn-ip" ? "VPN / IP location" : "Device location"} · ${clean}, ${code}`;
    message(note || `PawCare location set to ${clean}, ${code}.`);
    return true;
  }

  async function reverseGeocode(lat, lon) {
    const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=" +
      encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Location lookup failed");
    const data = await response.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.county;
    const state = stateCode(a.state);
    if (!city || !state || a.country_code !== "us") throw new Error("Outside supported area");
    return { city, state };
  }

  async function useVpnIp() {
    message("Checking the public IP location seen by PawCare…");
    try {
      const response = await fetch(API + "/locate", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Location service unavailable");
      const data = await response.json();
      if (!data || data.error || !data.us || data.la == null || data.lo == null) {
        const country = data && data.country ? ` Detected country: ${data.country}.` : "";
        throw new Error("The IP location is not in the United States." + country + " Connect to a U.S. VPN server or choose a U.S. city manually.");
      }
      let city = data.city || "";
      let state = stateCode(data.region);
      if (!city || !state) {
        const place = await reverseGeocode(Number(data.la), Number(data.lo));
        city = place.city; state = place.state;
      }
      apply(city, state, "vpn-ip", `IP-based location: ${city}, ${state}. If a VPN is connected, this is usually its exit-server area; VPN providers and IP databases can be imprecise.`);
    } catch (error) {
      message(error.message || "We couldn't estimate a U.S. IP location. Connect to a U.S. VPN server or choose a city manually.");
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      message("GPS isn't available in this browser. Try VPN / internet location or choose a city.");
      return;
    }
    message("Finding your device location…");
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        apply(place.city, place.state, "gps", `Device location: ${place.city}, ${place.state}.`);
      } catch {
        message("Your device location couldn't be matched to a U.S. city. Choose a U.S. city manually.");
      }
    }, () => message("Location permission was denied or unavailable. Try VPN / internet location or choose a city manually."),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  $("pawcareUseGps")?.addEventListener("click", useGps);
  $("pawcareUseIp")?.addEventListener("click", useVpnIp);
  window.PawCareLocation = { useVpnIp, useGps };
})();
