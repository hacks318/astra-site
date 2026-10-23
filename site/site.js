const languageToggle = document.getElementById("language-toggle");
const translations = [...document.querySelectorAll("[data-pt][data-en]")];

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
  localStorage.setItem("astra-site-language", useEnglish ? "en" : "pt");
}

languageToggle.addEventListener("click", () => {
  setLanguage(document.documentElement.lang === "pt-BR" ? "en" : "pt");
});

document.getElementById("year").textContent = new Date().getFullYear();
const savedLanguage = localStorage.getItem("astra-site-language");
const browserLanguage = navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
setLanguage(savedLanguage || browserLanguage);
