/**
 * HSN/SAC Code Seeder
 * Run once: npx ts-node src/lib/seed-hsn-sac.ts
 * 
 * Seeds 22,000+ HSN codes (goods) and 680+ SAC codes (services)
 * from government master data into the hsn_sac_codes table.
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function seedHsnSac() {
  console.log('🔍 Checking existing HSN/SAC records...')
  const existing = await prisma.hsnSacCode.count()

  if (existing > 0) {
    console.log(`✅ Already seeded: ${existing} records. Skipping.`)
    return
  }

  console.log('📥 Loading HSN/SAC data...')
  
  // Read the JSON data file
  const dataPath = path.join(__dirname, 'hsn_sac_data.json')
  if (!fs.existsSync(dataPath)) {
    console.error('❌ hsn_sac_data.json not found at:', dataPath)
    console.error('   Place the JSON file in src/lib/ directory')
    process.exit(1)
  }

  const rawData: Array<{ code: string; description: string; codeType: string }> = 
    JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

  console.log(`📊 Total records to seed: ${rawData.length}`)

  // Batch insert in chunks of 500
  const CHUNK_SIZE = 500
  let inserted = 0

  for (let i = 0; i < rawData.length; i += CHUNK_SIZE) {
    const chunk = rawData.slice(i, i + CHUNK_SIZE)
    await prisma.hsnSacCode.createMany({
      data: chunk,
      skipDuplicates: true,
    })
    inserted += chunk.length
    process.stdout.write(`\r   Inserting... ${inserted}/${rawData.length}`)
  }

  console.log(`\n✅ Seeded ${inserted} HSN/SAC codes successfully!`)
  
  const hsnCount = await prisma.hsnSacCode.count({ where: { codeType: 'HSN' } })
  const sacCount = await prisma.hsnSacCode.count({ where: { codeType: 'SAC' } })
  console.log(`   📦 HSN (Goods): ${hsnCount}`)
  console.log(`   🔧 SAC (Services): ${sacCount}`)
}

seedHsnSac()
  .catch(e => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
