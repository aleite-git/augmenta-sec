from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import User


def health_check(request):
    return JsonResponse({"status": "ok"})


@login_required
def user_list(request):
    users = User.objects.values("id", "username", "email")
    return JsonResponse({"users": list(users)})


@login_required
def user_detail(request, pk):
    try:
        user = User.objects.values("id", "username", "email").get(pk=pk)
        return JsonResponse(user)
    except User.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
