import { EventEmitter } from 'events'

type EventEnvelope<T = any> = {
  type: string
  data: T
  at: number
}

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

export function emitEvent<T = any>(type: string, data: T) {
  const envelope: EventEnvelope<T> = {
    type,
    data,
    at: Date.now()
  }
  emitter.emit('event', envelope)
}

export function subscribeToEvents(listener: (event: EventEnvelope) => void) {
  emitter.on('event', listener)
  return () => {
    emitter.off('event', listener)
  }
}


