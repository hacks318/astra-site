const languageToggle = document.getElementById("language-toggle");
const translations = [...document.querySelectorAll("[data-pt][data-en]")];
const primaryDownload = document.getElementById("primary-download");
const primaryDownloadLabel = document.getElementById("primary-download-label");
const platform = /Windows/i.test(navigator.userAgent)
  ? "windows"
  : /Android/i.test(navigator.userAgent)
    ? "android"
    : "other";

document.body.dataset.platform = platform;

function updatePrimaryDownload(useEnglish) {
  if (platform === "windows") {
    primaryDownload.href = "./downloads/Astra-Setup-1.0.9.exe";
    primaryDownload.download = "Astra-Setup-1.0.9.exe";
    primaryDownloadLabel.textContent = useEnglish
      ? "Download Astra AI"
      : "Download Astra IA";
    primaryDownload.setAttribute(
      "aria-label",
      useEnglish ? "Download Astra for Windows" : "Baixar Astra para Windows"
    );
    return;
  }

  if (platform === "android") {
    primaryDownload.href = "./downloads/Astra-Android-debug.apk";
    primaryDownload.download = "Astra-Android-debug.apk";
    primaryDownloadLabel.textContent = useEnglish
      ? "Download Android APK"
      : "Baixar APK Android";
    primaryDownload.setAttribute(
      "aria-label",
      useEnglish ? "Download Astra for Android" : "Baixar Astra para Android"
    );
    return;
  }

  primaryDownload.href = "#download";
  primaryDownload.removeAttribute("download");
  primaryDownloadLabel.textContent = useEnglish ? "Download options" : "Opções de download";
  primaryDownload.setAttribute(
    "aria-label",
    useEnglish ? "View download options" : "Ver opções de download"
  );
}

function setLanguage(language) {
  const useEnglish = language === "en";
  document.documentElement.lang = useEnglish ? "en" : "pt-BR";
  for (const element of translations) {
    element.innerHTML = element.dataset[useEnglish ? "en" : "pt"];
  }
  languageToggle.textContent = useEnglish ? "PT" : "EN";
  languageToggle.setAttribute(
    "aria-label",
    useEnglish ? "Mudar para português" : "Switch to English"
  );
  document.title = useEnglish
    ? "Download Astra — your assistant, your way"
    : "Baixar Astra — sua assistente, do seu jeito";
  updatePrimaryDownload(useEnglish);
  localStorage.setItem("astra-site-language", useEnglish ? "en" : "pt");
}

languageToggle.addEventListener("click", () => {
  setLanguage(document.documentElement.lang === "pt-BR" ? "en" : "pt");
});

document.getElementById("year").textContent = new Date().getFullYear();
const savedLanguage = localStorage.getItem("astra-site-language");
const browserLanguage = navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
setLanguage(savedLanguage || browserLanguage);
