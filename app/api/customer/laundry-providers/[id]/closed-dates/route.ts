import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
 
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const provider_id = parseInt((await context.params).id)
 
    if (isNaN(provider_id)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid provider ID',
      }, { status: 400 })
    }
 
    // Fetch closed dates for this provider
    const result = await query(`
      SELECT
        closed_date,
        note
      FROM provider_closed_dates
      WHERE provider_id = $1
        AND closed_date >= CURRENT_DATE
      ORDER BY closed_date ASC
    `, [provider_id])
 
    const closedDates = result.rows.map(row => row.closed_date)
 
    return NextResponse.json({
      success: true,
      data: {
        closed_dates: closedDates,
        details: result.rows,
      },
    })
 
  } catch (error) {
    console.error('Error fetching closed dates:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch closed dates',
    }, { status: 500 })
  }
}