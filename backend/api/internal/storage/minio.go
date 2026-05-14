package storage

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinioClient struct {
	client *minio.Client
	bucket string
}

// NewMinio creates and initialises the MinIO client, ensuring the bucket exists.
func NewMinio(ctx context.Context) (*MinioClient, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "minio:9000"
	}
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(os.Getenv("MINIO_USER"), os.Getenv("MINIO_PASSWORD"), ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("minio.New: %w", err)
	}

	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "csedu-files"
	}

	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("BucketExists: %w", err)
	}
	if !exists {
		if err = mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("MakeBucket: %w", err)
		}
	}

	return &MinioClient{client: mc, bucket: bucket}, nil
}

// Upload stores a file and returns the object key.
func (m *MinioClient) Upload(ctx context.Context, objectKey, contentType string, r io.Reader, size int64) (string, error) {
	_, err := m.client.PutObject(ctx, m.bucket, objectKey, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("PutObject: %w", err)
	}
	return objectKey, nil
}

// GetObject retrieves an object from MinIO for streaming.
func (m *MinioClient) GetObject(ctx context.Context, objectKey string) (*minio.Object, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("GetObject: %w", err)
	}
	return obj, nil
}

// PresignedURL returns a temporary download URL (15 minutes).
func (m *MinioClient) PresignedURL(ctx context.Context, objectKey string) (string, error) {
	u, err := m.client.PresignedGetObject(ctx, m.bucket, objectKey, 15*60*1000000000, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
