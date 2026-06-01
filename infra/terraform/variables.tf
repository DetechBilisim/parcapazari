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
  default     = "parcapazari"
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