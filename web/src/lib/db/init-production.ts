/**
 * Production first-run initialisation
 *
 * Creates the MSP organisation and a super-admin user IF the database is empty.
 * Safe to re-run — it is a no-op if data already exists.
 *
 * Usage (from inside the running container):
 *   docker compose exec app node -e "require('./src/lib/db/init-production.js')"
 *
 * Or via the helper script on TrueNAS:
 *   bash init-admin.sh
 */

import { db } from "./index"
import { users, organizations, userOrganizationMemberships } from "./schema"
import { count, eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

const MSP_NAME    = process.env.MSP_NAME    ?? "My MSP"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@msp.local"
const ADMIN_PASS  = process.env.ADMIN_PASS  ?? "ChangeMe@1234!"

async function initProduction() {
  console.log("🔍  Checking if initialisation is needed...")

  const [{ total }] = await db.select({ total: count() }).from(users)

  if (Number(total) > 0) {
    console.log("✓  Database already has users — skipping init.")
    process.exit(0)
  }

  console.log("📦  Empty database detected — running first-time setup...")

  // Create MSP org
  const [org] = await db
    .insert(organizations)
    .values({
      name: MSP_NAME,
      slug: "msp",
      isMspOrg: true,
      isMaster: true,
    })
    .returning()

  console.log(`✓  MSP org created: ${org.name}`)

  // Create super admin
  const passwordHash = await bcrypt.hash(ADMIN_PASS, 12)

  const [admin] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      name: "MSP Admin",
      passwordHash,
      isMspStaff: true,
      isActive: true,
    })
    .returning()

  console.log(`✓  Super admin created: ${admin.email}`)

  // Link to org
  await db.insert(userOrganizationMemberships).values({
    userId: admin.id,
    organizationId: org.id,
    role: "msp_super_admin",
    isPrimary: true,
    crossOrgAccess: true,
  })

  console.log("")
  console.log("╔══════════════════════════════════════════════╗")
  console.log("║  ✅  First-time setup complete!              ║")
  console.log("║                                              ║")
  console.log(`║  Email:    ${ADMIN_EMAIL.padEnd(30)}  ║`)
  console.log(`║  Password: ${ADMIN_PASS.padEnd(30)}  ║`)
  console.log("║                                              ║")
  console.log("║  ⚠️  Change your password after first login  ║")
  console.log("╚══════════════════════════════════════════════╝")
  console.log("")

  process.exit(0)
}

initProduction().catch((err) => {
  console.error("❌  Init failed:", err)
  process.exit(1)
})
