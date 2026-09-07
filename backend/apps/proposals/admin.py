"""Django admin registration for proposals-domain models."""

from django.contrib import admin

from apps.proposals.models import (
    MatchProposal,
    MatchSkip,
    MediaEditProposal,
    MediaImageOverride,
    Proposal,
    ProposalVote,
    TMDBDeletedID,
)

admin.site.register(Proposal, admin.ModelAdmin)
admin.site.register(MatchProposal, admin.ModelAdmin)
admin.site.register(MediaEditProposal, admin.ModelAdmin)
admin.site.register(MediaImageOverride, admin.ModelAdmin)
admin.site.register(ProposalVote, admin.ModelAdmin)
admin.site.register(MatchSkip, admin.ModelAdmin)
admin.site.register(TMDBDeletedID, admin.ModelAdmin)
