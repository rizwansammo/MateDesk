from django.contrib import admin
from .models import Ticket, Reply


class ReplyInline(admin.TabularInline):
    model       = Reply
    extra       = 0
    readonly_fields = ('id', 'author', 'type', 'body', 'created_at')
    can_delete  = False


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display   = ('ticket_ref', 'subject', 'tenant', 'status', 'priority', 'assignee', 'created_at')
    list_filter    = ('status', 'priority', 'level', 'tenant')
    search_fields  = ('ticket_ref', 'subject', 'requester_name')
    readonly_fields = ('id', 'ticket_ref', 'seq', 'created_at', 'updated_at')
    ordering       = ('-created_at',)
    inlines        = [ReplyInline]


@admin.register(Reply)
class ReplyAdmin(admin.ModelAdmin):
    list_display  = ('ticket', 'type', 'author', 'created_at')
    list_filter   = ('type',)
    readonly_fields = ('id', 'created_at')
