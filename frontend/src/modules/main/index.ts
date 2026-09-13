import { createModule } from "@rpgjs/common";
import server from "./server.ts";

export function provideMain() {
    return createModule('main', [{
        server
    }])
}
