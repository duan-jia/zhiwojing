import { mergeConfig } from "@signe/di";
import { provideRpg, startGame } from "@rpgjs/client";
import startServer from "./server";
import configClient from "./config/config.client";
import { showLogin } from './login'
import './login.css'

async function startApp() {
  await showLogin()
  startGame(
    mergeConfig(configClient, {
      providers: [provideRpg(startServer)],
    })
  )
}

void startApp()
