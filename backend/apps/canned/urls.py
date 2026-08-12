from django.urls import path
from . import views

urlpatterns = [
    path('canned/categories/',            views.CategoryListCreateView.as_view(), name='canned_categories'),
    path('canned/categories/<uuid:pk>/',  views.CategoryDetailView.as_view(),     name='canned_category_detail'),
    path('canned/responses/',             views.ResponseListCreateView.as_view(),  name='canned_responses'),
    path('canned/responses/<uuid:pk>/',   views.ResponseDetailView.as_view(),      name='canned_response_detail'),
]
