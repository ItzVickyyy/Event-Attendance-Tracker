/* eslint-disable */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols
import { Route as rootRouteImport } from './routes/__root'
import { Route as LayoutRouteImport } from './routes/_layout'
import { Route as LoginRouteImport } from './routes/login'
import { Route as RecoverPasswordRouteImport } from './routes/recover-password'
import { Route as ResetPasswordRouteImport } from './routes/reset-password'
import { Route as SignupRouteImport } from './routes/signup'
import { Route as LayoutIndexRouteImport } from './routes/_layout/index'
import { Route as LayoutDashboardRouteImport } from './routes/_layout/dashboard'
import { Route as LayoutAccountRouteImport } from './routes/_layout/account'
import { Route as LayoutAccountProfileRouteImport } from './routes/_layout/account/profile'
import { Route as LayoutAccountSecurityRouteImport } from './routes/_layout/account/security'
import { Route as LayoutAdministrationRouteImport } from './routes/_layout/administration'
import { Route as LayoutAdministrationUsersRouteImport } from './routes/_layout/administration/users'
import { Route as LayoutAdministrationRolesRouteImport } from './routes/_layout/administration/roles'
import { Route as LayoutAdministrationAttendanceRouteImport } from './routes/_layout/administration/attendance'
import { Route as LayoutAdministrationScannerPermissionsRouteImport } from './routes/_layout/administration/scanner-permissions'
import { Route as LayoutAdministrationAuditLogsRouteImport } from './routes/_layout/administration/audit-logs'
import { Route as LayoutEventsRouteImport } from './routes/_layout/events'
import { Route as LayoutEventsNewRouteImport } from './routes/_layout/events/new'
import { Route as LayoutEventsEventIdRouteImport } from './routes/_layout/events/$eventId'
import { Route as LayoutEventsEventIdRegistrationRouteImport } from './routes/_layout/events/$eventId/registration'
import { Route as LayoutEventsEventIdRosterRouteImport } from './routes/_layout/events/$eventId/roster'
import { Route as LayoutRecordsRouteImport } from './routes/_layout/records'
import { Route as LayoutRecordsAttendanceRouteImport } from './routes/_layout/records/attendance'
import { Route as LayoutRecordsHistoryRouteImport } from './routes/_layout/records/history'
import { Route as LayoutRecordsIncompleteRouteImport } from './routes/_layout/records/incomplete'
import { Route as LayoutRecordsExportRouteImport } from './routes/_layout/records/export'
import { Route as LayoutScannerRouteImport } from './routes/_layout/scanner'
import { Route as LayoutScannerEventRouteImport } from './routes/_layout/scanner/event'
import { Route as LayoutScannerNfcRouteImport } from './routes/_layout/scanner/nfc'
import { Route as LayoutScannerManualRouteImport } from './routes/_layout/scanner/manual'
import { Route as LayoutScannerTimeInRouteImport } from './routes/_layout/scanner/time-in'
import { Route as LayoutScannerTimeOutRouteImport } from './routes/_layout/scanner/time-out'
import { Route as LayoutScannerSyncRouteImport } from './routes/_layout/scanner/sync'
import { Route as LayoutSettingsRouteImport } from './routes/_layout/settings'
import { Route as LayoutSettingsAttendanceRulesRouteImport } from './routes/_layout/settings/attendance-rules'
import { Route as LayoutSettingsTimeOutRouteImport } from './routes/_layout/settings/time-out'
import { Route as LayoutSettingsOrganizationRouteImport } from './routes/_layout/settings/organization'
import { Route as LayoutSectionsRouteImport } from './routes/_layout/sections'
import { Route as LayoutSectionsSectionIdRouteImport } from './routes/_layout/sections/$sectionId'
import { Route as LayoutSectionsSectionIdStudentsRouteImport } from './routes/_layout/sections/$sectionId/students'
import { Route as LayoutSectionsSectionIdStudentsStudentIdRouteImport } from './routes/_layout/sections/$sectionId/students/$studentId'
import { Route as LayoutSectionsSectionIdAttendanceRouteImport } from './routes/_layout/sections/$sectionId/attendance'

const LayoutRoute = LayoutRouteImport.update({ id: '/_layout', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const RecoverPasswordRoute = RecoverPasswordRouteImport.update({ id: '/recover-password', path: '/recover-password', getParentRoute: () => rootRouteImport } as any)
const ResetPasswordRoute = ResetPasswordRouteImport.update({ id: '/reset-password', path: '/reset-password', getParentRoute: () => rootRouteImport } as any)
const SignupRoute = SignupRouteImport.update({ id: '/signup', path: '/signup', getParentRoute: () => rootRouteImport } as any)
const LayoutIndexRoute = LayoutIndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => LayoutRoute } as any)
const LayoutDashboardRoute = LayoutDashboardRouteImport.update({ id: '/dashboard', path: '/dashboard', getParentRoute: () => LayoutRoute } as any)
const LayoutAccountRoute = LayoutAccountRouteImport.update({ id: '/account', path: '/account', getParentRoute: () => LayoutRoute } as any)
const LayoutAccountProfileRoute = LayoutAccountProfileRouteImport.update({ id: '/account/profile', path: '/profile', getParentRoute: () => LayoutAccountRoute } as any)
const LayoutAccountSecurityRoute = LayoutAccountSecurityRouteImport.update({ id: '/account/security', path: '/security', getParentRoute: () => LayoutAccountRoute } as any)
const LayoutAdministrationRoute = LayoutAdministrationRouteImport.update({ id: '/administration', path: '/administration', getParentRoute: () => LayoutRoute } as any)
const LayoutAdministrationUsersRoute = LayoutAdministrationUsersRouteImport.update({ id: '/administration/users', path: '/users', getParentRoute: () => LayoutAdministrationRoute } as any)
const LayoutAdministrationRolesRoute = LayoutAdministrationRolesRouteImport.update({ id: '/administration/roles', path: '/roles', getParentRoute: () => LayoutAdministrationRoute } as any)
const LayoutAdministrationAttendanceRoute = LayoutAdministrationAttendanceRouteImport.update({ id: '/administration/attendance', path: '/attendance', getParentRoute: () => LayoutAdministrationRoute } as any)
const LayoutAdministrationScannerPermissionsRoute = LayoutAdministrationScannerPermissionsRouteImport.update({ id: '/administration/scanner-permissions', path: '/scanner-permissions', getParentRoute: () => LayoutAdministrationRoute } as any)
const LayoutAdministrationAuditLogsRoute = LayoutAdministrationAuditLogsRouteImport.update({ id: '/administration/audit-logs', path: '/audit-logs', getParentRoute: () => LayoutAdministrationRoute } as any)
const LayoutEventsRoute = LayoutEventsRouteImport.update({ id: '/events', path: '/events', getParentRoute: () => LayoutRoute } as any)
const LayoutEventsNewRoute = LayoutEventsNewRouteImport.update({ id: '/events/new', path: '/new', getParentRoute: () => LayoutEventsRoute } as any)
const LayoutEventsEventIdRoute = LayoutEventsEventIdRouteImport.update({ id: '/events/$eventId', path: '/$eventId', getParentRoute: () => LayoutEventsRoute } as any)
const LayoutEventsEventIdRegistrationRoute = LayoutEventsEventIdRegistrationRouteImport.update({ id: '/events/$eventId/registration', path: '/registration', getParentRoute: () => LayoutEventsEventIdRoute } as any)
const LayoutEventsEventIdRosterRoute = LayoutEventsEventIdRosterRouteImport.update({ id: '/events/$eventId/roster', path: '/roster', getParentRoute: () => LayoutEventsEventIdRoute } as any)
const LayoutRecordsRoute = LayoutRecordsRouteImport.update({ id: '/records', path: '/records', getParentRoute: () => LayoutRoute } as any)
const LayoutRecordsAttendanceRoute = LayoutRecordsAttendanceRouteImport.update({ id: '/records/attendance', path: '/attendance', getParentRoute: () => LayoutRecordsRoute } as any)
const LayoutRecordsHistoryRoute = LayoutRecordsHistoryRouteImport.update({ id: '/records/history', path: '/history', getParentRoute: () => LayoutRecordsRoute } as any)
const LayoutRecordsIncompleteRoute = LayoutRecordsIncompleteRouteImport.update({ id: '/records/incomplete', path: '/incomplete', getParentRoute: () => LayoutRecordsRoute } as any)
const LayoutRecordsExportRoute = LayoutRecordsExportRouteImport.update({ id: '/records/export', path: '/export', getParentRoute: () => LayoutRecordsRoute } as any)
const LayoutScannerRoute = LayoutScannerRouteImport.update({ id: '/scanner', path: '/scanner', getParentRoute: () => LayoutRoute } as any)
const LayoutScannerEventRoute = LayoutScannerEventRouteImport.update({ id: '/scanner/event', path: '/event', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutScannerNfcRoute = LayoutScannerNfcRouteImport.update({ id: '/scanner/nfc', path: '/nfc', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutScannerManualRoute = LayoutScannerManualRouteImport.update({ id: '/scanner/manual', path: '/manual', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutScannerTimeInRoute = LayoutScannerTimeInRouteImport.update({ id: '/scanner/time-in', path: '/time-in', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutScannerTimeOutRoute = LayoutScannerTimeOutRouteImport.update({ id: '/scanner/time-out', path: '/time-out', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutScannerSyncRoute = LayoutScannerSyncRouteImport.update({ id: '/scanner/sync', path: '/sync', getParentRoute: () => LayoutScannerRoute } as any)
const LayoutSettingsRoute = LayoutSettingsRouteImport.update({ id: '/settings', path: '/settings', getParentRoute: () => LayoutRoute } as any)
const LayoutSettingsAttendanceRulesRoute = LayoutSettingsAttendanceRulesRouteImport.update({ id: '/settings/attendance-rules', path: '/attendance-rules', getParentRoute: () => LayoutSettingsRoute } as any)
const LayoutSettingsTimeOutRoute = LayoutSettingsTimeOutRouteImport.update({ id: '/settings/time-out', path: '/time-out', getParentRoute: () => LayoutSettingsRoute } as any)
const LayoutSettingsOrganizationRoute = LayoutSettingsOrganizationRouteImport.update({ id: '/settings/organization', path: '/organization', getParentRoute: () => LayoutSettingsRoute } as any)
const LayoutSectionsRoute = LayoutSectionsRouteImport.update({ id: '/sections', path: '/sections', getParentRoute: () => LayoutRoute } as any)
const LayoutSectionsSectionIdRoute = LayoutSectionsSectionIdRouteImport.update({ id: '/sections/$sectionId', path: '/$sectionId', getParentRoute: () => LayoutSectionsRoute } as any)
const LayoutSectionsSectionIdStudentsRoute = LayoutSectionsSectionIdStudentsRouteImport.update({ id: '/sections/$sectionId/students', path: '/students', getParentRoute: () => LayoutSectionsSectionIdRoute } as any)
const LayoutSectionsSectionIdStudentsStudentIdRoute = LayoutSectionsSectionIdStudentsStudentIdRouteImport.update({ id: '/sections/$sectionId/students/$studentId', path: '/$studentId', getParentRoute: () => LayoutSectionsSectionIdStudentsRoute } as any)
const LayoutSectionsSectionIdAttendanceRoute = LayoutSectionsSectionIdAttendanceRouteImport.update({ id: '/sections/$sectionId/attendance', path: '/attendance', getParentRoute: () => LayoutSectionsSectionIdRoute } as any)

const LayoutAccountRouteWithChildren = LayoutAccountRoute._addFileChildren({ LayoutAccountProfileRoute, LayoutAccountSecurityRoute })
const LayoutAdministrationRouteWithChildren = LayoutAdministrationRoute._addFileChildren({ LayoutAdministrationUsersRoute, LayoutAdministrationRolesRoute, LayoutAdministrationAttendanceRoute, LayoutAdministrationScannerPermissionsRoute, LayoutAdministrationAuditLogsRoute })
const LayoutEventsEventIdRouteWithChildren = LayoutEventsEventIdRoute._addFileChildren({ LayoutEventsEventIdRegistrationRoute, LayoutEventsEventIdRosterRoute })
const LayoutEventsRouteWithChildren = LayoutEventsRoute._addFileChildren({ LayoutEventsNewRoute, LayoutEventsEventIdRoute: LayoutEventsEventIdRouteWithChildren })
const LayoutRecordsRouteWithChildren = LayoutRecordsRoute._addFileChildren({ LayoutRecordsAttendanceRoute, LayoutRecordsHistoryRoute, LayoutRecordsIncompleteRoute, LayoutRecordsExportRoute })
const LayoutScannerRouteWithChildren = LayoutScannerRoute._addFileChildren({ LayoutScannerEventRoute, LayoutScannerNfcRoute, LayoutScannerManualRoute, LayoutScannerTimeInRoute, LayoutScannerTimeOutRoute, LayoutScannerSyncRoute })
const LayoutSettingsRouteWithChildren = LayoutSettingsRoute._addFileChildren({ LayoutSettingsAttendanceRulesRoute, LayoutSettingsTimeOutRoute, LayoutSettingsOrganizationRoute })
const LayoutSectionsSectionIdStudentsRouteWithChildren = LayoutSectionsSectionIdStudentsRoute._addFileChildren({ LayoutSectionsSectionIdStudentsStudentIdRoute })
const LayoutSectionsSectionIdRouteWithChildren = LayoutSectionsSectionIdRoute._addFileChildren({ LayoutSectionsSectionIdStudentsRoute: LayoutSectionsSectionIdStudentsRouteWithChildren, LayoutSectionsSectionIdAttendanceRoute })
const LayoutSectionsRouteWithChildren = LayoutSectionsRoute._addFileChildren({ LayoutSectionsSectionIdRoute: LayoutSectionsSectionIdRouteWithChildren })
const LayoutRouteWithChildren = LayoutRoute._addFileChildren({ LayoutIndexRoute, LayoutDashboardRoute, LayoutAccountRoute: LayoutAccountRouteWithChildren, LayoutAdministrationRoute: LayoutAdministrationRouteWithChildren, LayoutEventsRoute: LayoutEventsRouteWithChildren, LayoutRecordsRoute: LayoutRecordsRouteWithChildren, LayoutScannerRoute: LayoutScannerRouteWithChildren, LayoutSettingsRoute: LayoutSettingsRouteWithChildren, LayoutSectionsRoute: LayoutSectionsRouteWithChildren })
export const routeTree = rootRouteImport._addFileChildren({ LayoutRoute: LayoutRouteWithChildren, LoginRoute, RecoverPasswordRoute, ResetPasswordRoute, SignupRoute })
