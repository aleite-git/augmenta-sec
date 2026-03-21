from django.urls import path
from . import views

urlpatterns = [
    path("api/health/", views.health_check, name="health"),
    path("api/users/", views.user_list, name="user-list"),
    path("api/users/<int:pk>/", views.user_detail, name="user-detail"),
]
