# 阿里云备选 Runbook

首个预发布明确采用腾讯云；本文仅保留 POC 的云厂商可移植性，不授权创建阿里云资源。

若未来经架构审批切换阿里云，使用同地域、同 VPC 的 ECS + Tair/Redis，沿用标准 Redis 协议、私网白名单、同域 Nginx、服务器端 DeepSeek、namespace 隔离和 fail-closed health 合同。切换前必须重新执行全套 Redis 故障恢复、地域、备案接入、HTTPS、性能和真实 DeepSeek 验收，不得把腾讯云结果视为阿里云通过。
