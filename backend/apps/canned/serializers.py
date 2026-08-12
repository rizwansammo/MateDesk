from rest_framework import serializers
from .models import CannedCategory, CannedResponse


class CannedCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model        = CannedCategory
        fields       = ['id', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']


class CannedResponseSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()

    def get_category_name(self, obj):
        return obj.category.name if obj.category_id else ''

    class Meta:
        model        = CannedResponse
        fields       = ['id', 'category', 'category_name', 'title', 'body', 'created_at', 'updated_at']
        read_only_fields = ['id', 'category_name', 'created_at', 'updated_at']
