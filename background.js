const STORAGE_KEY = "rpk_v1";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    if (res && res[STORAGE_KEY]) return;
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        users: {},
        tags: [],
        schemaVersion: 1
      }
    });
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
