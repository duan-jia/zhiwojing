import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";
import { showLogin } from "./login";
import "./login.css";
import { setupContacts } from './contacts'

async function startApp() {
  const identity = await showLogin();
  const contacts = setupContacts(identity.id)
  const configuredHost = import.meta.env.VITE_RPGJS_SERVER_HOST?.trim();
  const host = configuredHost || `${window.location.hostname}:8001`;
  const token = window.localStorage.getItem('zhiwojing.auth-token') || ''

  try {
    await startGame(
      mergeConfig(configClient, {
        providers: [provideMmorpg({
          host,
          query: { token, avatar_id: String(identity.id) },
        })],
      }),
    );
  } catch (error) {
    console.error("RPGJS server connection failed", error);
    throw error;
  }
  window.addEventListener('beforeunload', () => contacts.destroy(), { once: true })
}

void startApp();
