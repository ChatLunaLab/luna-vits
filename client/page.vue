<template>
    <k-slot-item order="-200" v-if="show">
        <k-markdown unsafe :source="store.luna_vits_data" />
    </k-slot-item>
</template>

<script setup lang="ts">
import { computed, ComputedRef, inject } from 'vue'
import { store } from '@koishijs/client'
import type {} from '../lib/constants'

type Package = {
    name: string
}

const localPackage = inject('manager.settings.local') as ComputedRef<Package | null>

const show = computed(() => {
    return localPackage.value.name === 'koishi-plugin-luna-vits'
})
</script>
