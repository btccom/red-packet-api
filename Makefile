.PHONY: docker-build docker-push

docker-build:
	docker build . -t registry.cn-beijing.aliyuncs.com/btc-com/pushtx:red-packet

docker-push:
	docker push registry.cn-beijing.aliyuncs.com/btc-com/pushtx:red-packet