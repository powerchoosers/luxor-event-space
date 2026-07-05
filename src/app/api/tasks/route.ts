import { NextRequest, NextResponse } from 'next/server'
import { listTasksByInquiry, createTask, updateTask } from '@/lib/luxorTasksServer'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiryId parameter.' }, { status: 400 })
    }

    const tasks = await listTasksByInquiry(inquiryId)
    return NextResponse.json(tasks)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tasks.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { inquiryId, title, description, dueDate, priority } = body

    if (!inquiryId || !title) {
      return NextResponse.json({ error: 'inquiryId and title are required.' }, { status: 400 })
    }

    const task = await createTask(inquiryId, title, description, dueDate, priority)
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create task.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Task id is required.' }, { status: 400 })
    }

    const updatedTask = await updateTask(id, updates)
    return NextResponse.json(updatedTask)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update task.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
