import { $log } from "@tsed/common";
import { PlatformExpress } from "@tsed/platform-express";
import { Server } from "./Server";

async function bootstrap() {
  try {
    const platform = await PlatformExpress.bootstrap(Server);
    await platform.listen();

    $log.info("MANOE API Gateway started successfully");
    $log.info(`Server listening on port ${process.env.PORT || 3000}`);
  } catch (error) {
    $log.error({ event: "SERVER_BOOTSTRAP_ERROR", error });
    process.exit(1);
  }
}

bootstrap();
