export const THEME_STORAGE_KEY = "paddy-theme";

/** Runs before paint (inlined in <head>) so there's no light/dark flash. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
