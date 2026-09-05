"""Django admin registration for company-domain models."""

from django.contrib import admin

from apps.company.models import Company, CompanyRating, InvolvedCompany, UserCompanyFollow

admin.site.register(Company, admin.ModelAdmin)
admin.site.register(InvolvedCompany, admin.ModelAdmin)
admin.site.register(UserCompanyFollow, admin.ModelAdmin)
admin.site.register(CompanyRating, admin.ModelAdmin)
