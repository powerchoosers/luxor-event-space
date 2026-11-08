/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const { partitionLeadTasksForDisplay, orderedWorkflowStepOrdinal } = require('../src/lib/luxorFollowUpHelpers.ts')

test('orderedWorkflowStepOrdinal parses brochure step keys', () => {
  assert.equal(orderedWorkflowStepOrdinal('phone_2'), 2)
  assert.equal(orderedWorkflowStepOrdinal('email_4'), 4)
  assert.equal(orderedWorkflowStepOrdinal('manual'), null)
})

test('partitionLeadTasksForDisplay keeps one pending ordered step per enrollment', () => {
  const enrollment = 'e1111111-1111-4111-8111-111111111111'
  const tasks = [
    { id: 'a', status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_2' },
    { id: 'b', status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_3' },
    { id: 'c', status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_4' },
    { id: 'm', status: 'pending', title: 'manual' },
  ]
  const { visibleTasks, hiddenOrderedDuplicateCount } = partitionLeadTasksForDisplay(tasks)
  assert.equal(hiddenOrderedDuplicateCount, 2)
  assert.deepEqual(visibleTasks.map((task) => task.id), ['a', 'm'])
})

test('partitionLeadTasksForDisplay prefers adoption_designation current', () => {
  const enrollment = 'e2222222-2222-4222-8222-222222222222'
  const tasks = [
    { id: 'a', status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_2' },
    { id: 'b', status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_3', adoption_designation: 'current' },
  ]
  const { visibleTasks, hiddenOrderedDuplicateCount } = partitionLeadTasksForDisplay(tasks)
  assert.equal(hiddenOrderedDuplicateCount, 1)
  assert.deepEqual(visibleTasks.map((task) => task.id), ['b'])
})
