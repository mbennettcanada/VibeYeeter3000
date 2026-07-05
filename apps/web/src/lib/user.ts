import type { User } from "@vibeyeeter/types";
import { mockUser } from "./mock-data";

export function getCurrentUser(): User {
  return mockUser;
}
