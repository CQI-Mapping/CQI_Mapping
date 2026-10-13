// The IT21 Prelim Table of Specification, transcribed from the faculty's
// workbook. Used as the page's initial state so the workspace opens on real
// data instead of an empty form.
//
// This is also the fixture for the persistence layer that comes later: when the
// TOS is stored in Supabase, this becomes seed data rather than the live
// source. Nothing above it needs to change.
//
// Note the deliberate fidelity — the weighted column and the Bloom placement
// columns do not fully agree in the original (see the WEIGHT_DRIFT checks in
// tosMath.test.ts). We reproduce that rather than silently correcting it, so
// the warnings have something real to catch.

import type { TosExam, TosSheet, TosTopic } from './tosMath'

export const TOS_EXAM_META: TosExam = {
  code: 'IT21',
  title: 'Object Oriented Programming',
  examType: 'Table of Specification for Prelim',
  term: '1st Semester, 2026-2027',
  coverage:
    'Java Fundamentals, Data Types, Variables, Operators, Conditional Statements, Iterative Statements, Access Modifiers, and Methods',
  preparedBy: 'KENN MIGAN VINCENT C. GUMONAN. LPT. MSIT DM',
  totalHours: 8,
  school: 'NORTHERN BUKIDNON STATE COLLEGE',
  institute: 'Institute for Computer Studies',
}

export const TOS_SHEET_NOTE =
  'Note: Only those highligted with green are editable cells. Gray colored cells contains the formula.'

// The five items each of the three 2-hour topics carry in the MC sheet —
// remember through evaluate, no create.
const fiveAcross = { remember: 1, understand: 1, apply: 1, analyze: 1, evaluate: 1 }

const mcTopics: TosTopic[] = [
  {
    id: 'mc-1',
    position: 1,
    title: 'Java Review',
    slo: 'Explain the origin of Java, and its importance in the field of Information Technology',
    hours: 0.5,
    bloom: { remember: 1 },
  },
  {
    id: 'mc-2',
    position: 2,
    title: 'Java Syntax and Program Structure',
    slo: 'Demonstrate correct syntax conventions, compilation processes, and execution flows in Java applications.',
    hours: 0.5,
    bloom: { remember: 1 },
  },
  {
    id: 'mc-3',
    position: 3,
    title: 'Primitive and Reference Data Types',
    slo: 'Distinguish between primitive and reference data types and select appropriate types for memory efficiency.',
    hours: 1,
    bloom: { remember: 1, understand: 1, analyze: 1 },
  },
  {
    id: 'mc-4',
    position: 4,
    title: 'Conditional Statements',
    slo: 'Construct branching logic using conditional statements to control the flow of execution based on specific runtime conditions.',
    hours: 2,
    bloom: { ...fiveAcross },
  },
  {
    id: 'mc-5',
    position: 5,
    title: 'Iterative Statements',
    slo: 'Implement iterative statements and loop controls to execute repetitive tasks and process data collections efficiently.',
    hours: 2,
    bloom: { ...fiveAcross },
  },
  {
    id: 'mc-6',
    position: 6,
    title:
      'Object-Oriented Programming Fundamentals: Classes, Objects, Access Control, and Methods',
    slo: 'Design custom classes with proper encapsulation using access modifiers (public, private, protected, default), instantiate and manipulate objects in memory, and develop reusable, overloaded methods with appropriate parameters and return types.',
    hours: 2,
    bloom: { ...fiveAcross },
  },
]

const performanceTopics: TosTopic[] = [
  {
    id: 'pp-1',
    position: 1,
    title: 'Java Review',
    slo: 'Explain the origin of Java, and its importance in the field of Information Technology',
    hours: 0.5,
    bloom: { apply: 2 },
  },
  {
    id: 'pp-2',
    position: 2,
    title: 'Java Syntax and Program Structure',
    slo: 'Demonstrate correct syntax conventions, compilation processes, and execution flows in Java applications.',
    hours: 0.5,
    bloom: { apply: 2 },
  },
  {
    id: 'pp-3',
    position: 3,
    title: 'Primitive and Reference Data Types',
    slo: 'Distinguish between primitive and reference data types and select appropriate types for memory efficiency.',
    hours: 1.5,
    bloom: { apply: 6 },
  },
  {
    id: 'pp-4',
    position: 4,
    title: 'Conditional Statements',
    slo: 'Construct branching logic using conditional statements to control the flow of execution based on specific runtime conditions.',
    hours: 2,
    bloom: { analyze: 8 },
  },
  {
    id: 'pp-5',
    position: 5,
    title: 'Iterative Statements',
    slo: 'Implement iterative statements and loop controls to execute repetitive tasks and process data collections efficiently.',
    hours: 2,
    bloom: { analyze: 2, create: 6 },
  },
  {
    id: 'pp-6',
    position: 6,
    title:
      'Object-Oriented Programming Fundamentals: Classes, Objects, Access Control, and Methods',
    slo: 'Design custom classes with proper encapsulation using access modifiers (public, private, protected, default), instantiate and manipulate objects in memory, and develop reusable, overloaded methods with appropriate parameters and return types.',
    hours: 1.5,
    bloom: { create: 4 },
  },
]

export const TOS_SHEETS: TosSheet[] = [
  {
    id: 'multiple-choice',
    kind: 'items',
    label: 'Multiple Choice',
    total: 20,
    note: TOS_SHEET_NOTE,
    topics: mcTopics,
  },
  {
    id: 'product-performance-based',
    kind: 'points',
    label: 'ProductPerformance-Based',
    total: 30,
    note: TOS_SHEET_NOTE,
    topics: performanceTopics,
  },
]