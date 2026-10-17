// Content scripts only load into tabs opened after install, so inject the bee
// into tabs that were already open. content.js guards against double-loading.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {}); // restricted pages (Web Store, etc.) can't be scripted
  }
});
