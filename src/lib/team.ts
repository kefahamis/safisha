/*
 * A company's own staff and departments: shapes shared by the team screens and
 * the server that fills them.
 */

import type { Department, Workspace } from "./auth/types";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  roleName: string;
  /** What their role carries on its own, before the department. */
  rolePermissions: string[];
  workspace: Workspace;
  departmentId?: string;
  truckId?: string;
  grants: string[];
  denies: string[];
  suspended: boolean;
  lastLoginAt?: string;
  createdAt: string;
  /** Company admins and drivers are shown but managed elsewhere. */
  editable: boolean;
}

export interface TeamBundle {
  company: string;
  departments: (Department & { members: number })[];
  staff: StaffMember[];
  /** What this admin may hand out: the company pool, capped at what they hold. */
  assignable: string[];
}
