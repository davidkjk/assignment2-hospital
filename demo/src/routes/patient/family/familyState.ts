import { useSyncExternalStore } from 'react'
import { currentPatient, initialFamilyMembers } from './mockData'
import type { FamilyMember } from './mockData'

export type FamilyStoreSnapshot = {
  self: FamilyMember
  members: FamilyMember[]
}

const initialSnapshot: FamilyStoreSnapshot = {
  self: currentPatient,
  members: initialFamilyMembers,
}

let snapshot: FamilyStoreSnapshot = initialSnapshot
const listeners = new Set<() => void>()

function sortMembers(members: FamilyMember[]): FamilyMember[] {
  return [...members].sort((left, right) => left.name.localeCompare(right.name, 'ko'))
}

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): FamilyStoreSnapshot {
  return snapshot
}

export function useFamilyStore(): FamilyStoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getFamilyMember(memberId: string): FamilyMember | undefined {
  if (snapshot.self.id === memberId) return snapshot.self
  return snapshot.members.find((member) => member.id === memberId && member.isActive)
}

export function addFamilyMember(member: FamilyMember) {
  snapshot = {
    ...snapshot,
    members: sortMembers([...snapshot.members.filter((item) => item.id !== member.id), member]),
  }
  notify()
}

export function updateFamilyMember(memberId: string, changes: Partial<FamilyMember>) {
  if (snapshot.self.id === memberId) {
    snapshot = { ...snapshot, self: { ...snapshot.self, ...changes } }
  } else {
    snapshot = {
      ...snapshot,
      members: sortMembers(
        snapshot.members.map((member) =>
          member.id === memberId ? { ...member, ...changes } : member,
        ),
      ),
    }
  }
  notify()
}

export function unlinkFamilyMember(memberId: string) {
  if (snapshot.self.id === memberId) return
  snapshot = {
    ...snapshot,
    members: snapshot.members.filter((member) => member.id !== memberId),
  }
  notify()
}

// 테스트와 데모 재시작 시 모듈 로컬 상태를 정본으로 되돌리는 도우미.
export function resetFamilyStore() {
  snapshot = {
    self: { ...initialSnapshot.self },
    members: initialSnapshot.members.map((member) => ({ ...member })),
  }
  notify()
}
