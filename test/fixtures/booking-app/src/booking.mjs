// SPDX-License-Identifier: MIT-0
// Fixture for examples/flow-booking.review.json. Line numbers are referenced; keep them stable.
export function hasCapacity(slot) {
  return slot.booked < slot.capacity;
}
export function reserve(slot, customer) {
  if (!hasCapacity(slot)) return null;
  return { slotId: slot.id, customer, startsAt: slot.startsAt, status: 'confirmed' };
}
export function cancel(booking, now) {
  const hoursBefore = (Date.parse(booking.startsAt) - Date.parse(now)) / 36e5;
  return hoursBefore >= 24 ? { ...booking, status: 'cancelled' } : null;
}
