import type { ApiContext } from "./context.js";
import { logger } from "../logger.js";
import type {
  NavigationMenuCategory,
  NotificationMessage,
  UserInterest,
  InterestWeight,
} from "../types.js";

export async function getMainNavigations(
  ctx: ApiContext,
): Promise<NavigationMenuCategory[]> {
  logger.info("[INFO] Fetching main navigations...");
  try {
    const result = await ctx.trpcClient.call<{
      menus?: NavigationMenuCategory[];
    }>("menu.findMainNavigations", {});
    logger.info("[SUCCESS] getMainNavigations succeeded");
    if (result && typeof result === "object" && "menus" in result) {
      return (result as { menus: NavigationMenuCategory[] }).menus || [];
    }
    return Array.isArray(result) ? (result as NavigationMenuCategory[]) : [];
  } catch (error) {
    logger.error("[ERROR] getMainNavigations failed:", error);
    throw error;
  }
}

export async function getNotificationMessages(
  ctx: ApiContext,
): Promise<NotificationMessage[]> {
  logger.info("[INFO] Fetching notification messages...");
  try {
    const result = await ctx.trpcClient.call<NotificationMessage[]>(
      "notification.getMessages",
    );
    logger.info("[SUCCESS] getNotificationMessages succeeded");
    return Array.isArray(result) ? result : [];
  } catch (error) {
    logger.error("[ERROR] getNotificationMessages failed:", error);
    throw error;
  }
}

export async function getUserInterests(
  ctx: ApiContext,
  withIcon: boolean = false,
): Promise<UserInterest[]> {
  const endpoint = withIcon
    ? "interest.readInterestsWithIcon"
    : "interest.readInterests";
  logger.info(`[INFO] Fetching user interests (${endpoint})...`);
  try {
    const result = await ctx.trpcClient.call<{ interests?: UserInterest[] }>(
      endpoint,
    );
    logger.info("[SUCCESS] getUserInterests succeeded");
    if (result && typeof result === "object" && "interests" in result) {
      return (result as { interests: UserInterest[] }).interests || [];
    }
    return Array.isArray(result) ? (result as UserInterest[]) : [];
  } catch (error) {
    logger.error("[ERROR] getUserInterests failed:", error);
    throw error;
  }
}

export async function getInterestWeights(
  ctx: ApiContext,
): Promise<InterestWeight[]> {
  logger.info("[INFO] Fetching interest weights...");
  try {
    const result = await ctx.trpcClient.call<{
      weights?: InterestWeight[];
      success?: boolean;
    }>("interest.readWeights");
    logger.info("[SUCCESS] getInterestWeights succeeded");
    if (result && typeof result === "object" && "weights" in result) {
      return (result as { weights: InterestWeight[] }).weights || [];
    }
    return Array.isArray(result) ? (result as InterestWeight[]) : [];
  } catch (error) {
    logger.error("[ERROR] getInterestWeights failed:", error);
    throw error;
  }
}
