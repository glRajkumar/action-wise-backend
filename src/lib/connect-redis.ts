import { createClient } from 'redis'
import { env } from '../utils/env'

export const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) return new Error('Too many retries to connect redis')

      const jitter = Math.floor(Math.random() * 100)
      const delay = Math.min(Math.pow(2, retries) * 50, 3000)
      return delay + jitter
    },
  },
})

export async function connectRedis() {
  try {
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err)
    })

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...')
    })

    await redisClient.connect()
    console.log('Redis is connected now')
  } catch (error) {
    console.log("Can't connect to Redis", error)
    throw error
  }
}
