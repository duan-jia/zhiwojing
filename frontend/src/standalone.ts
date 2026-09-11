import { mergeConfig } from "@signe/di";
import { provideRpg, startGame } from "@rpgjs/client";
import startServer from "./server";
import configClient from "./config/config.client";
import { showLogin } from './login'
import './login.css'
import { startWorldConnection } from './world-connection'

async function startApp() {
  await showLogin()
  startWorldConnection()
  try {
    await startGame(
      mergeConfig(configClient, {
        providers: [provideRpg(startServer)],
      })
    )
  } catch (error) {
    const status = document.querySelector<HTMLElement>('.world-connection span')
    if (status) status.textContent = '游戏资源加载失败，请刷新重试'
    console.error('RPGJS startup failed', error)
  }
}

void startApp()
