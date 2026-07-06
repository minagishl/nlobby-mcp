import { accountModule } from "./account.js";
import { authModule } from "./auth.js";
import { coursesModule } from "./courses.js";
import { designatedSchoolModule } from "./designated-school.js";
import { examModule } from "./exam.js";
import { healthModule } from "./health.js";
import { navigationModule } from "./navigation.js";
import { newsModule } from "./news.js";
import { scheduleModule } from "./schedule.js";
import { schoolingModule } from "./schooling.js";
import type { MCPModule } from "../types.js";

export const toolModules: MCPModule[] = [
  newsModule,
  accountModule,
  schoolingModule,
  designatedSchoolModule,
  coursesModule,
  scheduleModule,
  examModule,
  navigationModule,
  authModule,
  healthModule,
];
