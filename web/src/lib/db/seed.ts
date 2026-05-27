/**
 * Development seed — creates the MSP org, a super admin, and a demo client.
 * Run with: npm run db:seed
 * NEVER run against production.
 */
import { db } from "./index"
import { users, organizations, userOrganizationMemberships, mspBranding } from "./schema"
import bcrypt from "bcryptjs"

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed production database")
  }

  console.log("🌱 Seeding database...")

  // ─── MSP Organisation ──────────────────────────────────────────────────────
  const [mspOrg] = await db
    .insert(organizations)
    .values({
      name: "My MSP Company",
      slug: "msp",
      isMspOrg: true,
      isMaster: true,
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
    })
    .onConflictDoNothing()
    .returning()

  console.log("✅ MSP org:", mspOrg?.name ?? "already exists")

  // ─── MSP Super Admin ───────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin@12345!", 12)

  const [adminUser] = await db
    .insert(users)
    .values({
      email: "admin@msp.local",
      name: "MSP Admin",
      passwordHash,
      isMspStaff: true,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning()

  console.log("✅ Super admin:", adminUser?.email ?? "already exists")

  if (adminUser && mspOrg) {
    await db
      .insert(userOrganizationMemberships)
      .values({
        userId: adminUser.id,
        organizationId: mspOrg.id,
        role: "msp_super_admin",
        isPrimary: true,
        crossOrgAccess: true,
      })
      .onConflictDoNothing()
  }

  // ─── Demo Client ───────────────────────────────────────────────────────────
  const [clientOrg] = await db
    .insert(organizations)
    .values({
      name: "Acme Holdings",
      slug: "acme",
      isMaster: true,
    })
    .onConflictDoNothing()
    .returning()

  const [clientChild] = await db
    .insert(organizations)
    .values({
      name: "Acme Cape Town",
      slug: "acme-cpt",
      parentId: clientOrg?.id,
    })
    .onConflictDoNothing()
    .returning()

  console.log("✅ Demo client:", clientOrg?.name ?? "already exists")
  console.log("✅ Demo child org:", clientChild?.name ?? "already exists")

  // ─── Demo Client Admin User ────────────────────────────────────────────────
  const clientPwdHash = await bcrypt.hash("Client@12345!", 12)

  const [clientUser] = await db
    .insert(users)
    .values({
      email: "admin@acme.local",
      name: "Acme Admin",
      passwordHash: clientPwdHash,
      isMspStaff: false,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning()

  if (clientUser && clientOrg) {
    await db
      .insert(userOrganizationMemberships)
      .values({
        userId: clientUser.id,
        organizationId: clientOrg.id,
        role: "client_admin",
        isPrimary: true,
        crossOrgAccess: true, // Can access Acme Cape Town
      })
      .onConflictDoNothing()
  }

  console.log("✅ Demo client user:", clientUser?.email ?? "already exists")

  // ─── MSP Branding defaults ────────────────────────────────────────────────
  await db
    .insert(mspBranding)
    .values({
      companyName: "My MSP Company",
      primaryColor: "#3B82F6",
      accentColor: "#1E40AF",
      defaultTheme: "system",
      reportHeaderHtml: "<h1>Monthly IT Infrastructure Report</h1>",
      supportEmail: "support@msp.local",
    })
    .onConflictDoNothing()

  console.log("\n🎉 Seed complete!")
  console.log("─────────────────────────────────")
  console.log("MSP Admin login:    admin@msp.local / Admin@12345!")
  console.log("Client Admin login: admin@acme.local / Client@12345!")
  console.log("─────────────────────────────────")

  process.exit(0)
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})
