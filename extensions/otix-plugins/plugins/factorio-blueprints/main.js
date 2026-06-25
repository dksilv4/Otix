// extensions/otix-plugins/plugins/factorio-blueprints/main.js
// Factorio Blueprint vault and community sharing plugin for Otix

module.exports = {
  plugin: function(ctx) {
    ctx.logger.info('Factorio Blueprints loaded')

    // Handlers registered in Task 3+

    ctx.onDestroy(() => {
      ctx.logger.info('Factorio Blueprints unloaded')
    })
  },

  slotRender: async function(ctx, location) {
    return {
      widgets: [{
        type: 'game-tab',
        props: {
          tabId: 'blueprints',
          label: 'Blueprints',
          gameIds: ['427520'],
        }
      }]
    }
  },

  status: async function(ctx) {
    return { loaded: true }
  },

  test: async function(ctx, configDraft) {
    return { success: true, message: 'Plugin ready' }
  }
}
