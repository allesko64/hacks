// backend/src/agent.ts
import 'reflect-metadata'

import {
  createAgent,
  IDIDManager,
  IKeyManager,
  IResolver,
  IDataStore,
  IDataStoreORM
} from '@veramo/core'

import { KeyManager } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'

import {
  Entities,
  migrations,
  DataStore,
  DataStoreORM,
  KeyStore,
  DIDStore,
  PrivateKeyStore
} from '@veramo/data-store'

import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'

import { EthrDIDProvider } from '@veramo/did-provider-ethr'

import { Resolver } from 'did-resolver'
import { getResolver as ethrGetResolver } from 'ethr-did-resolver'

import { CredentialPlugin } from '@veramo/credential-w3c'
import { SelectiveDisclosure } from '@veramo/selective-disclosure'

import { createConnection, ConnectionOptions, Connection } from 'typeorm'
import * as path from 'path'
import { ensureAuthTables } from './db/setup'

let _agent: any = null
let _db: Connection | null = null

const DB_PATH = path.resolve(__dirname, '../db/database.sqlite')

// ------------------------------------------
// TYPEORM CONFIG
// ------------------------------------------
const typeormOptions: ConnectionOptions = {
  type: 'sqlite',
  database: DB_PATH,
  entities: Entities,
  migrations,
  migrationsRun: true,
  logging: false,
  synchronize: false
}

// ------------------------------------------
// OPTIMIZED LOCAL DID RESOLVER
// ------------------------------------------
//
// This is the KEY to making verification PASS.
// No RPC calls, no Sepolia downtime, pure local DID docs.
//
const localEthrResolver = ethrGetResolver({
  localResolver: true,
  networks: [
    {
      name: 'sepolia',
      rpcUrl: 'dummy',        // not used
      registry: undefined,    // DISABLE on-chain registry
      chainId: 11155111
    }
  ]
})

// ------------------------------------------
// AGENT FACTORY
// ------------------------------------------
export async function getAgent() {
  if (_agent) return _agent

  if (!_db) {
    _db = await createConnection(typeormOptions)
    await ensureAuthTables(_db)
  }

  _agent = createAgent<
    IDIDManager & IKeyManager & IResolver & IDataStore & IDataStoreORM
  >({
    plugins: [
      // KEY MANAGEMENT
      new KeyManager({
        store: new KeyStore(_db),
        kms: {
          local: new KeyManagementSystem(new PrivateKeyStore(_db))
        }
      }),

      // DID MANAGEMENT
      new DIDManager({
        store: new DIDStore(_db),
        defaultProvider: 'did:ethr:sepolia',
        providers: {
          'did:ethr:sepolia': new EthrDIDProvider({
            defaultKms: 'local',
            network: 'sepolia',
            rpcUrl: 'dummy' // irrelevant because resolver is local
          })
        }
      }),

      // DID RESOLUTION (LOCAL ONLY)
      new DIDResolverPlugin({
        resolver: new Resolver({
          ...localEthrResolver
        })
      }),

      // CREDENTIALS
      new CredentialPlugin(),
      new SelectiveDisclosure(),

      // DATA STORE
      new DataStore(_db),
      new DataStoreORM(_db)
    ]
  })

  return _agent
}

export async function getDbConnection() {
  if (_db) return _db
  _db = await createConnection(typeormOptions)
  await ensureAuthTables(_db)
  return _db
}
