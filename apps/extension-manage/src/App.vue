<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { bridge } from './bridge'

type ExtensionInfo = chrome.management.ExtensionInfo

const connected = ref(false)
const extensions = ref<ExtensionInfo[]>([])
const iconUrls = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref<string | null>(null)

let unsubscribe: (() => void) | null = null

async function init() {
  await bridge.$waitForReady()
  connected.value = true
  await loadExtensions()

  unsubscribe = bridge.extensions.onChanged(() => {
    loadExtensions()
  })
}

async function loadExtensions() {
  loading.value = true
  error.value = null
  try {
    const list = await bridge.extensions.getAll()
    extensions.value = list

    // Fetch all icons as data URLs in parallel (failures are silently ignored)
    const results = await Promise.allSettled(
      list
        .filter(ext => ext.icons?.length)
        .map(async ext => {
          const icon = ext.icons![ext.icons!.length - 1]
          const dataUrl = await bridge.resources.fetch(icon.url)
          return { id: ext.id, dataUrl }
        })
    )
    const urls: Record<string, string> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        urls[r.value.id] = r.value.dataUrl
      }
    }
    iconUrls.value = urls
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

async function toggleEnabled(ext: ExtensionInfo) {
  await bridge.extensions.setEnabled({ id: ext.id, enabled: !ext.enabled })
}

async function uninstall(ext: ExtensionInfo) {
  if (!confirm(`确认卸载「${ext.name}」？`))
    return
  await bridge.extensions.uninstall({ id: ext.id, showConfirmDialog: false })
}

onMounted(() => {
  init().catch((e) => {
    connected.value = false
    error.value = e instanceof Error ? e.message : String(e)
    loading.value = false
  })
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<template>
  <div class="app">
    <header>
      <h1>Extension Manager</h1>
      <span class="status" :class="connected ? 'connected' : 'disconnected'">
        {{ connected ? '已连接' : '未连接' }}
      </span>
    </header>

    <div v-if="error" class="error">
      {{ error }}
    </div>

    <div v-else-if="loading" class="loading">
      加载中…
    </div>

    <ul v-else class="list">
      <li v-for="ext in extensions" :key="ext.id" class="item" :class="{ disabled: !ext.enabled }">
        <img v-if="iconUrls[ext.id]" :src="iconUrls[ext.id]" class="icon" alt="" />
        <div class="info">
          <span class="name">{{ ext.name }}</span>
          <span class="version">v{{ ext.version }}</span>
        </div>
        <div class="actions">
          <button @click="toggleEnabled(ext)">
            {{ ext.enabled ? '禁用' : '启用' }}
          </button>
          <button class="danger" @click="uninstall(ext)">
            卸载
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; }

.app { max-width: 800px; margin: 0 auto; padding: 24px; }

header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
h1 { font-size: 1.5rem; }

.status {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
}
.status.connected { background: #d1fae5; color: #065f46; }
.status.disconnected { background: #fee2e2; color: #991b1b; }

.error { color: #dc2626; padding: 12px; background: #fee2e2; border-radius: 8px; }
.loading { color: #6b7280; }

.list { list-style: none; display: flex; flex-direction: column; gap: 8px; }

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  transition: opacity .15s;
}
.item.disabled { opacity: .5; }

.icon { width: 32px; height: 32px; flex-shrink: 0; }

.info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.name { font-weight: 500; }
.version { font-size: 0.75rem; color: #9ca3af; }

.actions { display: flex; gap: 8px; }

button {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}
button:hover { background: #f3f4f6; }
button.danger { color: #dc2626; border-color: #fca5a5; }
button.danger:hover { background: #fee2e2; }
</style>
