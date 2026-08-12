from django.urls import path
from .views import (
    KBArticleListView, KBArticleDetailView, KBArticleLinkTicketView,
    KBFolderListView, KBFolderDetailView, KBTagListView,
    KBArticleVersionListView, KBArticleVersionDetailView, KBArticleVersionRestoreView,
)

urlpatterns = [
    path('kb/tags/',                              KBTagListView.as_view(),            name='kb_tags'),
    path('kb/folders/',                           KBFolderListView.as_view(),         name='kb_folders'),
    path('kb/folders/<uuid:pk>/',                 KBFolderDetailView.as_view(),       name='kb_folder_detail'),
    path('kb/articles/',                          KBArticleListView.as_view(),        name='kb_articles'),
    path('kb/articles/<uuid:pk>/',                KBArticleDetailView.as_view(),      name='kb_article_detail'),
    path('kb/articles/<uuid:pk>/link-ticket/',    KBArticleLinkTicketView.as_view(),  name='kb_article_link_ticket'),
    path('kb/articles/<uuid:pk>/versions/',                   KBArticleVersionListView.as_view(),    name='kb_article_versions'),
    path('kb/articles/<uuid:pk>/versions/<uuid:version_pk>/', KBArticleVersionDetailView.as_view(),  name='kb_article_version_detail'),
    path('kb/articles/<uuid:pk>/versions/<uuid:version_pk>/restore/', KBArticleVersionRestoreView.as_view(), name='kb_article_version_restore'),
]
