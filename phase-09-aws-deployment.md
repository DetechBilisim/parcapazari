# Phase 9 — AWS Deployment

> **Goal:** Deploy ParçaPazar to AWS Free Tier — backend and frontend on an EC2 instance, database on RDS PostgreSQL, and part image storage migrated from local filesystem to S3. Infrastructure is defined with Terraform. By the end of this phase, the app is live on a public IP, and Aikido's CSPM, VM Scanning, and Container Image Scanning modules have real cloud targets to analyze.

> **Estimated time:** 4–6 hours (first AWS deployment always takes longer)
> **Phase outcome:** Live application on AWS. Cloud infrastructure vulnerabilities planted for Aikido's CSPM and cloud-side modules.

---

## Prerequisites

Before starting, you need:

- **AWS account with Free Tier active** (credit card verified, but Free Tier resources cost nothing within limits for 12 months)
- **AWS CLI installed** — `aws --version` should work
- **Terraform installed** — `terraform --version` should show 1.5+
- **An SSH key pair** for EC2 access

Install AWS CLI and Terraform if missing:

```bash
# macOS (Homebrew)
brew install awscli terraform

# Verify
aws --version
terraform --version
```

Configure AWS CLI with your credentials:

```bash
aws configure
# AWS Access Key ID: <from AWS IAM console>
# AWS Secret Access Key: <from AWS IAM console>
# Default region: eu-central-1   (Frankfurt — closest to Turkey)
# Default output format: json
```

> ⚠️ **Free Tier caution:** Use `t2.micro` or `t3.micro` for EC2, `db.t3.micro` for RDS. Stay within 750 hours/month. Stop or destroy resources when not demoing to avoid charges after the free tier expires.

---

## What's Included in This Phase

1. Terraform infrastructure (VPC, EC2, RDS, S3, security groups, IAM)
2. S3 bucket for part images
3. Backend changes: migrate image upload from local disk to S3
4. EC2 setup: install Docker, pull and run the stack
5. RDS PostgreSQL connection
6. Environment configuration for production
7. **Deliberate vulnerabilities:** public S3 bucket, permissive IAM, SSH open to the world, AWS key in `.env.example`

---

## Step 9.1 — Terraform Project Structure

Create the infrastructure directory:

```bash
mkdir -p infra/terraform
cd infra/terraform
```

**`infra/terraform/versions.tf`**
```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

**`infra/terraform/variables.tf`**
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "parcapazar"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "parcapazar"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  default     = "parcapazar_dev_password"
}

variable "ssh_key_name" {
  description = "Name of the EC2 SSH key pair"
  type        = string
}
```

---

## Step 9.2 — Networking & Security Groups

**`infra/terraform/network.tf`**
```hcl
# Use the default VPC for simplicity
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group for the EC2 instance
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "Security group for ParcaPazar app server"
  vpc_id      = data.aws_vpc.default.id

  # HTTP
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Frontend (Nginx on 8080)
  ingress {
    description = "Frontend"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Backend API
  ingress {
    description = "Backend API"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH — open to the entire internet
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-app-sg"
  }
}

# Security group for RDS
resource "aws_security_group" "db" {
  name        = "${var.project_name}-db-sg"
  description = "Security group for ParcaPazar database"
  vpc_id      = data.aws_vpc.default.id

  # PostgreSQL — open to the world
  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-db-sg"
  }
}
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **SSH open to `0.0.0.0/0`** — the entire internet can attempt SSH connections. Should be restricted to your IP. Aikido CSPM flags this as critical.
>
> 2. **PostgreSQL open to `0.0.0.0/0`** — the database is reachable from anywhere on the internet, not just the app server. A massive exposure. Aikido CSPM flags this.

---

## Step 9.3 — S3 Bucket for Part Images

**`infra/terraform/s3.tf`**
```hcl
resource "aws_s3_bucket" "part_images" {
  bucket = "${var.project_name}-part-images-${random_id.suffix.hex}"

  tags = {
    Name = "${var.project_name}-part-images"
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

# Allow public access to the bucket
resource "aws_s3_bucket_public_access_block" "part_images" {
  bucket = aws_s3_bucket.part_images.id

  block_public_acls       = false
  block_public_policy      = false
  ignore_public_acls       = false
  restrict_public_buckets  = false
}

# Public read policy — anyone can read uploaded part images
resource "aws_s3_bucket_policy" "part_images_public_read" {
  bucket = aws_s3_bucket.part_images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.part_images.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.part_images]
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **Public S3 bucket** — `block_public_acls`, `block_public_policy`, etc. all set to `false`, plus a bucket policy allowing `s3:GetObject` to `Principal: "*"`. Anyone on the internet can read all objects. Combined with the fact that uploads aren't validated (Phase 7), this is a serious data exposure. Aikido CSPM flags this immediately.

---

## Step 9.4 — IAM Role for EC2

**`infra/terraform/iam.tf`**
```hcl
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Overly permissive policy — full access to S3 and more
resource "aws_iam_role_policy" "ec2_policy" {
  name = "${var.project_name}-ec2-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:*"
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "ec2:*"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **Overly permissive IAM policy** — grants `s3:*` and `ec2:*` on `Resource: "*"`. If the EC2 instance is compromised, the attacker gets full S3 and EC2 control across the account. Should follow least-privilege (only the specific bucket, only needed actions). Aikido CSPM flags this.

---

## Step 9.5 — RDS PostgreSQL

**`infra/terraform/rds.tf`**
```hcl
resource "aws_db_instance" "postgres" {
  identifier             = "${var.project_name}-db"
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp2"

  db_name                = "parcapazar_dev"
  username               = var.db_username
  password               = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]

  publicly_accessible    = true
  skip_final_snapshot    = true

  # No encryption at rest
  storage_encrypted      = false

  # No automated backups
  backup_retention_period = 0

  tags = {
    Name = "${var.project_name}-db"
  }
}
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **`publicly_accessible = true`** — RDS instance gets a public endpoint.
> 2. **`storage_encrypted = false`** — no encryption at rest.
> 3. **`backup_retention_period = 0`** — backups disabled.
>
> All three are Aikido CSPM findings.

---

## Step 9.6 — EC2 Instance

**`infra/terraform/ec2.tf`**
```hcl
# Latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.micro"
  key_name               = var.ssh_key_name
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  user_data = <<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y docker git
    systemctl start docker
    systemctl enable docker
    usermod -aG docker ec2-user

    # Install docker compose plugin
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  EOF

  tags = {
    Name = "${var.project_name}-app"
  }
}
```

**`infra/terraform/outputs.tf`**
```hcl
output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "s3_bucket_name" {
  value = aws_s3_bucket.part_images.bucket
}
```

---

## Step 9.7 — Create SSH Key Pair

Before running Terraform, create an EC2 key pair (if you don't have one):

```bash
aws ec2 create-key-pair \
  --key-name parcapazar-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/parcapazar-key.pem

chmod 400 ~/.ssh/parcapazar-key.pem
```

---

## Step 9.8 — Deploy the Infrastructure

```bash
cd infra/terraform

# Initialize
terraform init

# Review the plan
terraform plan -var="ssh_key_name=parcapazar-key"

# Apply
terraform apply -var="ssh_key_name=parcapazar-key"
```

Type `yes` when prompted. After a few minutes you'll see outputs:

```
ec2_public_ip = "X.X.X.X"
rds_endpoint = "parcapazar-db.xxxxx.eu-central-1.rds.amazonaws.com:5432"
s3_bucket_name = "parcapazar-part-images-xxxxxxxx"
```

Save these values.

---

## Step 9.9 — Migrate Image Upload to S3

Now update the backend to upload part images to S3 instead of local disk.

Install the AWS SDK:

```bash
cd backend
npm install @aws-sdk/client-s3
```

**`backend/src/lib/s3.ts`**
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });

const BUCKET = process.env.S3_BUCKET || "";

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `https://${BUCKET}.s3.amazonaws.com/${key}`;
}
```

Update the image upload route to use memory storage + S3. In **`backend/src/lib/upload.ts`**, add a memory-based uploader:

```typescript
import multer from "multer";

// ... existing diskStorage exports ...

// Memory storage for S3 uploads
export const partImageMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
```

Update the image upload handler in **`backend/src/routes/listingRoutes.ts`** to use S3:

```typescript
import { partImageMemoryUpload } from "../lib/upload.js";
import { uploadToS3 } from "../lib/s3.js";

// Replace the existing image upload route:
listingRoutes.post(
  "/parts/:partId/image",
  authenticate,
  requireRole("WHOLESALER"),
  partImageMemoryUpload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const key = `part-images/${Date.now()}-${req.file.originalname}`;
    const imageUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    await prisma.part.update({
      where: { id: req.params.partId },
      data: { imageUrl },
    });

    res.json({ imageUrl });
  }
);
```

---

## Step 9.10 — Production Environment File

Create **`backend/.env.production`** (do NOT commit — it's in `.gitignore`):

```
PORT=4000
DATABASE_URL="postgresql://parcapazar:parcapazar_dev_password@RDS_ENDPOINT_HERE:5432/parcapazar_dev?schema=public"
AWS_REGION=eu-central-1
S3_BUCKET=parcapazar-part-images-xxxxxxxx
```

Update **`backend/.env.example`** (this one IS committed):

```
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
AWS_REGION=eu-central-1
S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

> ⚠️ **Deliberate vulnerability:**
>
> **AWS credentials in `.env.example`** — committing AWS access keys (even example-looking ones) to the repo. These specific keys are AWS's documentation examples, but Aikido Secrets Detection flags any AWS key pattern in committed files. This mirrors a very common real-world mistake.

---

## Step 9.11 — Deploy the App to EC2

SSH into the instance:

```bash
ssh -i ~/.ssh/parcapazar-key.pem ec2-user@EC2_PUBLIC_IP
```

On the instance:

```bash
# Clone your repo (use HTTPS or set up a deploy key)
git clone https://github.com/YOUR_USERNAME/parcapazar.git
cd parcapazar

# Create production env for backend
nano backend/.env
# Paste the production DATABASE_URL pointing to RDS, S3_BUCKET, AWS_REGION

# Build and run
docker compose up -d --build
```

Run migrations against RDS:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

---

## Step 9.12 — Verify the Live Deployment

From your local machine:

- Frontend: `http://EC2_PUBLIC_IP:8080`
- Backend health: `http://EC2_PUBLIC_IP:4000/api/health`
- GraphQL: `http://EC2_PUBLIC_IP:4000/graphql`

Log in with the seeded admin and verify the app works end-to-end on AWS.

**Verify the deliberate vulnerabilities exist:**

```bash
# S3 bucket is public — this should work without credentials
curl https://BUCKET_NAME.s3.amazonaws.com/

# RDS is publicly accessible — port scan shows 5432 open
nc -zv RDS_ENDPOINT 5432

# SSH open to the world — confirmed by the security group rule
aws ec2 describe-security-groups --filters "Name=group-name,Values=parcapazar-app-sg" \
  --query "SecurityGroups[0].IpPermissions"
```

---

## Step 9.13 — Commit

```bash
git add .
git commit -m "feat: phase 9 aws deployment with terraform"
```

Update `NOTES.md`. **Double-check** you have NOT committed `backend/.env` or `backend/.env.production` (only `.env.example`).

---

## Phase 9 — Verification Checklist

- [ ] AWS CLI configured and working
- [ ] Terraform installed
- [ ] SSH key pair created
- [ ] `terraform apply` succeeds; outputs show EC2 IP, RDS endpoint, S3 bucket
- [ ] EC2 instance reachable via SSH
- [ ] Docker + compose installed on EC2 (via user_data)
- [ ] Backend image upload migrated to S3
- [ ] App deployed and running on EC2
- [ ] Migrations run against RDS
- [ ] Frontend reachable at `http://EC2_IP:8080`
- [ ] Backend health reachable at `http://EC2_IP:4000/api/health`
- [ ] `.env` and `.env.production` NOT committed
- [ ] Phase 9 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 9

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `infra/terraform/network.tf` | SSH (port 22) open to `0.0.0.0/0` | CSPM + IaC Scanning |
| 2 | `infra/terraform/network.tf` | PostgreSQL (port 5432) open to `0.0.0.0/0` | CSPM + IaC Scanning |
| 3 | `infra/terraform/s3.tf` | Public S3 bucket (public read policy) | CSPM + IaC Scanning |
| 4 | `infra/terraform/iam.tf` | Overly permissive IAM (`s3:*`, `ec2:*` on `*`) | CSPM + IaC Scanning |
| 5 | `infra/terraform/rds.tf` | RDS publicly accessible, unencrypted, no backups | CSPM + IaC Scanning |
| 6 | `backend/.env.example` | AWS access keys committed to repo | Secrets Detection |

---

## Two Scanning Angles for the Demo

Phase 9 produces findings through **two different Aikido lenses**, which makes a strong demo point:

1. **IaC Scanning (shift-left)** — Aikido scans the Terraform files in the repo and flags the misconfigurations *before* deployment. "These problems were visible in the code."

2. **CSPM (production-time)** — Aikido connects to the live AWS account and flags the *same* problems on the running infrastructure. "And here they are live in your cloud."

Showing the same issue caught at both stages demonstrates the IaC vs CSPM distinction from Faz 3 — and why having both matters.

---

## ⚠️ Cost Management

After demoing, **destroy the infrastructure** to avoid charges (especially once the 12-month Free Tier ends):

```bash
cd infra/terraform
terraform destroy -var="ssh_key_name=parcapazar-key"
```

Or just **stop** the EC2 instance and RDS when not in use, and start them again before a demo. S3 storage costs are negligible for a few images.

---

## What Comes Next

**Phase 10 — GitHub Actions + Aikido Integration (Final Phase):**
- GitHub Actions CI/CD pipeline
- Connect every Aikido module (the payoff of all this work)
- Add a few final deliberate vulnerabilities (outdated dependencies, GPL package)
- Run the first full scan and watch the dashboard fill up
- Prepare the demo narrative

This is the phase where everything comes together and the dashboard becomes demo-ready.

When you're ready, request `phase-10-aikido-integration.md`.
